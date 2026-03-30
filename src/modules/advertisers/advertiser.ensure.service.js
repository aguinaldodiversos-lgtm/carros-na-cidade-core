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

/**
 * Resolve `city_id` para novo registro em `advertisers`:
 * 1) `explicitCityId` válido em `cities`
 * 2) texto em `users.city` (se existir coluna) → busca aproximada em `cities`
 * 3) primeira cidade cadastrada (fallback)
 *
 * @param {string} userId
 * @param {number|null|undefined} explicitCityId
 */
export async function resolveCityIdForNewAdvertiser(userId, explicitCityId) {
  if (explicitCityId != null && !Number.isNaN(Number(explicitCityId))) {
    const cid = Number(explicitCityId);
    const { rows } = await pool.query(`SELECT id FROM cities WHERE id = $1 LIMIT 1`, [cid]);
    if (rows[0]?.id != null) {
      return Number(rows[0].id);
    }
  }

  const usersCols = await getUsersColumnSet();
  if (hasColumn(usersCols, "city")) {
    const u = await pool.query(`SELECT city FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const cityText = String(u.rows[0]?.city || "").trim();
    if (cityText.length >= 2) {
      const token = cityText.split(/[-–—,\s]+/)[0]?.trim();
      if (token && token.length >= 2) {
        const { rows: match } = await pool.query(
          `
          SELECT id FROM cities
          WHERE name ILIKE $1
          ORDER BY id ASC
          LIMIT 1
          `,
          [`%${token}%`]
        );
        if (match[0]?.id != null) {
          return Number(match[0].id);
        }
      }
    }
  }

  const { rows: fb } = await pool.query(`SELECT id FROM cities ORDER BY id ASC LIMIT 1`);
  if (!fb[0]?.id) {
    throw new AppError(
      "Nenhuma cidade cadastrada no sistema. Importe cidades (ex.: seed IBGE) antes de usar anunciantes.",
      503
    );
  }
  return Number(fb[0].id);
}

/**
 * Fonte única: garante uma linha em `advertisers` por usuário (idempotente).
 * Se já existir, devolve; se não, cria com `city_id` resolvido (explícito ou fallback).
 *
 * @param {string} userId
 * @param {{ cityId?: number|null, requestId?: string|null, source?: string }} [options]
 * @returns {Promise<{ id: string|number, user_id?: string }>}
 */
export async function ensureAdvertiserForUser(userId, options = {}) {
  const requestId = options.requestId ?? null;
  const source = options.source ?? "ensure";

  if (!userId || String(userId).trim() === "") {
    throw new AppError("userId obrigatório para anunciante.", 400);
  }

  const cityId = await resolveCityIdForNewAdvertiser(
    userId,
    options.cityId != null ? Number(options.cityId) : null
  );

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

    const contactCols = USER_CONTACT_COLUMN_PRIORITY.filter((c) => usersCols.has(c));
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
