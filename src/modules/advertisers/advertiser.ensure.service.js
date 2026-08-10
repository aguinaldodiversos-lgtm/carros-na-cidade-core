import { pool, withTransaction } from "../../infrastructure/database/db.js";
import { getAccountUser } from "../account/account.user.read.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { slugify } from "../../shared/utils/slugify.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

/** Ordem de preferência para ler telefone/WhatsApp em `users` (schema varia por deploy). */
const USER_CONTACT_COLUMN_PRIORITY = [
  "whatsapp",
  "phone",
  "mobile_phone",
  "telephone",
  "telefone",
  "contact_phone",
  "celular",
];

/** Onde gravar o mesmo contato em `advertisers` (só colunas que existirem). */
const ADVERTISER_CONTACT_COLUMN_PRIORITY = [
  "whatsapp",
  "phone",
  "mobile_phone",
  "telephone",
  "telefone",
];

const USER_ADDRESS_COLUMN_PRIORITY = ["address", "endereco"];
const ADVERTISER_ADDRESS_COLUMN_PRIORITY = ["address", "endereco"];

let advertisersColumnsPromise = null;
let usersColumnsPromise = null;

async function getAdvertisersColumnSet() {
  if (!advertisersColumnsPromise) {
    advertisersColumnsPromise = pool
      .query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'advertisers'
        `
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((error) => {
        advertisersColumnsPromise = null;
        throw error;
      });
  }

  return advertisersColumnsPromise;
}

async function getUsersColumnSet() {
  if (!usersColumnsPromise) {
    usersColumnsPromise = pool
      .query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users'
        `
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((error) => {
        usersColumnsPromise = null;
        throw error;
      });
  }

  return usersColumnsPromise;
}

function hasColumn(columns, name) {
  return columns.has(name);
}

function pickContactFromUserRow(row, usersCols) {
  for (const col of USER_CONTACT_COLUMN_PRIORITY) {
    if (!usersCols.has(col)) continue;
    const v = row[col];
    if (v != null && String(v).trim()) {
      return String(v).trim();
    }
  }
  return null;
}

function buildContactFieldsForAdvertiser(contact, advertiserCols) {
  if (!contact) {
    return {};
  }
  const out = {};
  for (const col of ADVERTISER_CONTACT_COLUMN_PRIORITY) {
    if (advertiserCols.has(col)) {
      out[col] = contact;
    }
  }
  return out;
}

function pickAddressFromUserRow(row, usersCols) {
  for (const col of USER_ADDRESS_COLUMN_PRIORITY) {
    if (!usersCols.has(col)) continue;
    const v = row[col];
    if (v != null && String(v).trim()) {
      return String(v).trim();
    }
  }
  return null;
}

function buildAddressFieldsForAdvertiser(address, advertiserCols) {
  if (!address) {
    return {};
  }
  const out = {};
  for (const col of ADVERTISER_ADDRESS_COLUMN_PRIORITY) {
    if (advertiserCols.has(col)) {
      out[col] = address;
    }
  }
  return out;
}

/**
 * Resolve `city_id` para novo registro em `advertisers`.
 *
 * REGRA ÚNICA: a cidade tem que vir explícita e existir em `cities`.
 * Não há segunda tentativa, não há aproximação, não há default.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ISTO SUBSTITUIU, E POR QUÊ (Fase 0.1, 2026-08-10)
 * ────────────────────────────────────────────────────────────────────────────
 * A versão anterior tinha três degraus, e os dois últimos decidiam a cidade de
 * um anunciante SEM ninguém ter dito qual era:
 *
 *   2) `users.city` (TEXT livre, opcional) → primeiro token → `name ILIKE
 *      '%token%' ORDER BY id ASC LIMIT 1`. Busca parcial, SEM UF. "São Paulo -
 *      SP" vira o token "São" e casa a primeira cidade cujo nome contenha
 *      "São" por ordem de id — que quase nunca é São Paulo. O Brasil tem
 *      dezenas de municípios homônimos entre estados; sem UF a consulta é um
 *      sorteio.
 *
 *   3) `SELECT id FROM cities ORDER BY id ASC LIMIT 1` — a primeira cidade da
 *      tabela. Em produção isso é uma cidade concreta e específica: todo
 *      anunciante que caísse aqui nascia lá dentro, silenciosamente.
 *
 * Nenhum dos dois emitia log, erro ou qualquer sinal. O anunciante ficava com
 * a cidade errada e ninguém sabia — e cidade errada num marketplace territorial
 * contamina vitrine, busca por proximidade e, no futuro, o fan-out regional das
 * oportunidades (um lojista recebendo demanda da região errada).
 *
 * A auditoria da Fase 0 comprovou que o caminho legítimo de publicação SEMPRE
 * passa `city_id` (validado por Zod, vindo do próprio anúncio) via
 * `ensureAdvertiserForPublishing`. O único caminho de produção que chegava aos
 * degraus 2 e 3 era `POST /api/account/plans/eligibility`, que criava
 * anunciante como efeito colateral sem precisar dele — efeito removido no mesmo
 * commit.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FALHAR ALTO, NÃO BAIXINHO
 * ────────────────────────────────────────────────────────────────────────────
 * Recusar é a resposta certa: um anunciante sem cidade conhecida é um dado que
 * não deveria existir, e inventá-la troca um erro visível por uma corrupção
 * invisível. O WARN abaixo existe porque falha silenciosa já custou caro neste
 * projeto: se algum fluxo legítimo chegar aqui sem cidade, queremos descobrir
 * pelo log no mesmo dia, não por um anúncio na cidade errada semanas depois.
 *
 * @param {string} userId — só para observabilidade da recusa; NÃO é fonte de cidade
 * @param {number|null|undefined} explicitCityId
 * @returns {Promise<number>} id existente em `cities`
 * @throws {AppError} 400 quando ausente, malformado ou inexistente
 */
export async function resolveCityIdForNewAdvertiser(userId, explicitCityId) {
  const reject = (reason) => {
    logger.warn(
      {
        ...buildDomainFields({
          action: "advertiser.city.resolve",
          result: "error",
          userId,
          reason,
        }),
        // Valor cru só no log (nunca na resposta) para diagnosticar quem chamou.
        receivedCityId: explicitCityId ?? null,
      },
      "[advertiser] cidade explícita ausente ou inválida — criação recusada"
    );

    return new AppError("Cidade válida é obrigatória.", 400, true, {
      code: "ADVERTISER_CITY_REQUIRED",
    });
  };

  if (explicitCityId == null || String(explicitCityId).trim() === "") {
    throw reject("missing");
  }

  const cityId = Number(explicitCityId);
  // Number("12.5") e Number("1e3") passariam num teste frouxo de NaN; um id de
  // cidade é inteiro positivo e nada mais.
  if (!Number.isInteger(cityId) || cityId <= 0) {
    throw reject("malformed");
  }

  const { rows } = await pool.query(`SELECT id FROM cities WHERE id = $1 LIMIT 1`, [cityId]);
  if (rows[0]?.id == null) {
    throw reject("not_found");
  }

  return Number(rows[0].id);
}

/**
 * Fonte única: garante uma linha em `advertisers` por usuário (idempotente).
 * Se já existir, devolve; se não, cria com o `city_id` EXPLÍCITO informado.
 *
 * `options.cityId` é obrigatório **apenas no caminho de criação**. Quem só quer
 * "me devolva o anunciante deste usuário" continua podendo chamar sem cidade:
 * a resolução acontece depois da checagem de existência, dentro da transação
 * (ver comentário no corpo). Sem isso, `ensure` deixaria de ser idempotente —
 * a segunda chamada exigiria um dado que a primeira já consumiu.
 *
 * @param {string} userId
 * @param {{ cityId?: number|null, requestId?: string|null, source?: string }} [options]
 * @returns {Promise<{ id: string|number, user_id?: string }>}
 * @throws {AppError} 400 quando precisa criar e não recebeu cidade válida
 */
export async function ensureAdvertiserForUser(userId, options = {}) {
  const requestId = options.requestId ?? null;
  const source = options.source ?? "ensure";

  if (!userId || String(userId).trim() === "") {
    throw new AppError("userId obrigatório para anunciante.", 400);
  }

  const account = await getAccountUser(userId);

  const [advertiserCols, usersCols] = await Promise.all([
    getAdvertisersColumnSet(),
    getUsersColumnSet(),
  ]);

  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [String(userId)]);

    const existing = await client.query(
      `SELECT id, user_id FROM advertisers WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (existing.rows[0]?.id) {
      return existing.rows[0];
    }

    // Cidade é exigida SÓ a partir daqui — depois de sabermos que vamos mesmo
    // criar a linha. Resolver antes tornaria a função não-idempotente: quem
    // chamasse `ensure` uma segunda vez, apenas para obter o anunciante já
    // existente, seria recusado por não repetir um dado que não vai usar.
    //
    // A leitura sai pelo `pool` (não pelo `client`) de propósito: é um SELECT
    // por PK numa tabela que a transação não toca, e mantê-lo fora evita
    // acoplar o lookup ao ciclo de vida da transação.
    const cityId = await resolveCityIdForNewAdvertiser(userId, options.cityId ?? null);

    const contactCols = [...USER_CONTACT_COLUMN_PRIORITY, ...USER_ADDRESS_COLUMN_PRIORITY].filter(
      (c, index, arr) => usersCols.has(c) && arr.indexOf(c) === index
    );
    let contactRow = {};
    if (contactCols.length) {
      const cr = await client.query(
        `
        SELECT ${contactCols.join(", ")}
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [userId]
      );
      contactRow = cr.rows[0] || {};
    }

    const contact = pickContactFromUserRow(contactRow, usersCols);
    const contactFields = buildContactFieldsForAdvertiser(contact, advertiserCols);
    const address = pickAddressFromUserRow(contactRow, usersCols);
    const addressFields = buildAddressFieldsForAdvertiser(address, advertiserCols);

    const displayName = account.name?.trim() || "Anunciante";
    const baseSlug = (slugify(`${displayName}-${userId}`) || `anunciante-${userId}`).slice(0, 120);

    const isLojista = account.type === "CNPJ";

    const row = {
      user_id: userId,
      city_id: Number(cityId),
      name: displayName,
      company_name: isLojista ? displayName : null,
      email:
        String(account.email || "")
          .trim()
          .toLowerCase() || null,
      plan: account.raw_plan || "free",
      status: "active",
      verified: false,
      ...contactFields,
      ...addressFields,
    };

    const fieldNames = [];
    const values = [];

    for (const [key, value] of Object.entries(row)) {
      if (!hasColumn(advertiserCols, key)) {
        continue;
      }
      if (key === "email" && !value) {
        continue;
      }
      if (key === "company_name" && value == null) {
        continue;
      }
      fieldNames.push(key);
      values.push(value);
    }

    if (!hasColumn(advertiserCols, "slug")) {
      throw new AppError("Schema de anunciantes incompatível (coluna slug ausente).", 500);
    }

    const maxAttempts = 8;
    const slug = baseSlug;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptSlug =
        attempt === 0 ? slug : `${baseSlug}-${Date.now()}-${attempt}`.slice(0, 120);
      const insertFields = [...fieldNames, "slug"];
      const insertValues = [...values, attemptSlug];
      const placeholders = insertFields.map((_, i) => `$${i + 1}`).join(", ");

      try {
        const insert = await client.query(
          `
          INSERT INTO advertisers (${insertFields.join(", ")})
          VALUES (${placeholders})
          RETURNING id, user_id
          `,
          insertValues
        );

        logger.info(
          {
            ...buildDomainFields({
              action: "advertiser.ensure.create",
              result: "success",
              requestId,
              userId,
            }),
            source,
            cityId: Number(cityId),
            advertiserId: insert.rows[0]?.id,
          },
          "[advertiser] cadastro criado"
        );

        return insert.rows[0];
      } catch (error) {
        if (error?.code === "23505" && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new AppError("Não foi possível criar o cadastro de anunciante.", 500);
  });
}

/**
 * Publicação de anúncio: exige `city_id` do veículo (cidade do anúncio).
 * Idempotente: se o anunciante já existir, reutiliza a linha (não altera cidade).
 *
 * @param {string} userId
 * @param {{ cityId: number, requestId?: string|null, source?: string }} context
 */
export async function ensureAdvertiserForPublishing(userId, context = {}) {
  const cityId = context.cityId;
  if (cityId == null || Number.isNaN(Number(cityId))) {
    throw new AppError("Não foi possível criar o cadastro de anunciante: cidade inválida.", 400);
  }

  return ensureAdvertiserForUser(userId, {
    cityId: Number(cityId),
    requestId: context.requestId ?? null,
    source: context.source ?? "ads.publish",
  });
}
