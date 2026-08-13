import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * O limite de 3 veículos por lojista sob CONCORRÊNCIA REAL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 * ────────────────────────────────────────────────────────────────────────────
 * O teste unitário roda contra um array em memória com uma "conexão" só: quatro
 * envios simultâneos nunca disputam nada lá, e um service SEM transação nenhuma
 * passaria em todos aqueles casos. O bug que este arquivo caça é exatamente o
 * que o fake não consegue ver:
 *
 *     SELECT count  → 0
 *     SELECT count  → 0     (outro request, mesma janela)
 *     SELECT count  → 0
 *     SELECT count  → 0
 *     INSERT ×4     → QUATRO veículos onde o limite é três
 *
 * O índice único NÃO protege contra isso: são quatro ANÚNCIOS DIFERENTES, então
 * as quatro linhas são legítimas do ponto de vista da chave. Só o
 * `SELECT ... FOR UPDATE` na procura serializa a contagem.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O SERVICE DE VERDADE, NÃO UMA RÉPLICA EM SQL
 * ────────────────────────────────────────────────────────────────────────────
 * O teste importa `sendVehicleToBuyer` e o executa contra este banco. Escrever
 * o BEGIN/SELECT/INSERT à mão aqui provaria que o PostgreSQL sabe travar linha
 * — que ninguém duvida — e continuaria passando no dia em que alguém removesse
 * a transação do service. É a diferença entre testar a regra e testar o
 * alcance dela.
 *
 * Para isso o `DATABASE_URL` é apontado para o banco temporário ANTES do
 * primeiro import de `db.js` (o pool é construído no carregamento do módulo).
 * Por isso os imports do service são dinâmicos e ficam depois do setup.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/purchase-intent-offers-concurrency.integration.test.js
 */

dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `piofferconc_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}

function makeDatabaseUrl(name) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function runMigrations(dbUrl) {
  const entryPath = path.join(workspaceRoot, "scripts/run-migrations.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        TEST_DATABASE_URL: dbUrl,
        NODE_ENV: "test",
        RUN_WORKERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c.toString()));
    child.stderr.on("data", (c) => (output += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`migrations falharam (${code}).\n${output}`))
    );
  });
}

// --- setup: banco temporário + service apontado para ele --------------------

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

// ORDEM CRÍTICA: o pool de `db.js` é construído no load do módulo, a partir de
// `env.DATABASE_URL`. Apontar depois do import não teria efeito nenhum.
process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";

const offers = await import(
  "../../src/modules/purchase-intents/purchase-intent-offers.service.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

/**
 * Quatro anúncios COMPATÍVEIS (Honda HR-V automático), todos abaixo do
 * orçamento. Quatro e não três: é o quarto que precisa ser recusado.
 */
async function seedWorld() {
  await pool.query(
    `TRUNCATE purchase_intent_offers, purchase_intents, ads, advertisers, users, cities RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );
  const cityId = cityRows[0].id;

  const { rows: buyerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('buyer@conc.test', 'x', 'Comprador', 'cpf') RETURNING id`
  );
  const buyerId = buyerRows[0].id;

  const { rows: dealerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('dealer@conc.test', 'x', 'Loja', 'cnpj') RETURNING id`
  );
  const dealerId = dealerRows[0].id;

  const { rows: advRows } = await pool.query(
    `INSERT INTO advertisers (user_id, city_id, name, slug, status)
     VALUES ($1, $2, 'ittmotors', 'ittmotors', 'active') RETURNING id`,
    [dealerId, cityId]
  );
  const advertiserId = advRows[0].id;

  const adIds = [];
  for (let i = 1; i <= 4; i += 1) {
    const { rows } = await pool.query(
      `INSERT INTO ads (advertiser_id, city_id, title, price, brand, model, year, mileage,
                        transmission, body_type, status, slug, images)
       VALUES ($1, $2, $3, $4, 'Honda', 'HR-V EX 1.8 Flex 16V 5p Aut.', 2020, 72000,
               'automatico', 'suv', 'active', $5, '[]'::jsonb)
       RETURNING id`,
      [advertiserId, cityId, `Honda HR-V ${i}`, 90000 + i * 100, `honda-hr-v-conc-${i}`]
    );
    adIds.push(rows[0].id);
  }

  const { rows: intentRows } = await pool.query(
    `INSERT INTO purchase_intents (
       buyer_user_id, city_id, intent_type, brand, brand_slug, model, model_slug,
       transmission, max_price, purchase_timeframe, status, expires_at
     )
     VALUES ($1, $2, 'specific_model', 'Honda', 'honda', 'HR-V', 'hr-v',
             'automatico', 100000, 'within_30_days', 'active', NOW() + INTERVAL '30 days')
     RETURNING id`,
    [buyerId, cityId]
  );

  return { buyerId, dealerId, cityId, advertiserId, adIds, intentId: intentRows[0].id };
}

beforeEach(async () => {
  await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool().catch(() => {});
  await adminPool
    .query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    )
    .catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`).catch(() => {});
  await adminPool.end().catch(() => {});
});

async function countOffers(intentId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM purchase_intent_offers WHERE purchase_intent_id = $1`,
    [intentId]
  );
  return rows[0].n;
}

describe.sequential("integração — as três consultas rodam no PostgreSQL real", () => {
  /**
   * Guarda contra a classe de bug que o fake NÃO pega: coluna inexistente.
   *
   * `SELECT a.image_url` passou por toda a suíte unitária porque o fake
   * devolvia o campo — um fake concorda com qualquer query. O PostgreSQL real
   * respondeu "column a.image_url does not exist" e derrubou o envio inteiro.
   *
   * Estes três casos existem para que CADA caminho de leitura da fase seja
   * executado contra um banco de verdade pelo menos uma vez. O de matching é o
   * que faltava: ele usa as mesmas AD_CARD_COLUMNS do envio, então tinha o
   * mesmo defeito e nenhum teste de integração o exercitava.
   */
  it("listMatchingAdsForDealer roda contra o banco e devolve o estoque compatível", async () => {
    const world = await seedWorld();

    const result = await offers.listMatchingAdsForDealer(
      String(world.dealerId),
      String(world.intentId)
    );

    expect(result.matching_ads).toHaveLength(4);
    expect(result.limit).toMatchObject({ max_per_dealer: 3, used: 0, remaining: 3 });

    // O DTO é montado a partir de colunas REAIS — se `AD_CARD_COLUMNS` voltar a
    // pedir algo que `ads` não tem, a query estoura antes desta asserção.
    const [first] = result.matching_ads;
    expect(first.vehicle_name).toBe("Honda HR-V");
    expect(first.year).toBe(2020);
    expect(first.mileage).toBe(72000);
    expect(first.budget_relation).toBe("within_budget");
    expect(first.already_sent).toBe(false);
    // Sem foto no fixture (`images = '[]'`), a capa é null — não um erro.
    expect(first.main_image).toBeNull();
  }, 180000);

  it("getAdForDealer roda contra o banco (é o caminho do envio)", async () => {
    const world = await seedWorld();

    const result = await offers.sendVehicleToBuyer(
      String(world.dealerId),
      String(world.intentId),
      { ad_id: world.adIds[0] }
    );
    expect(result.created).toBe(true);
  }, 180000);

  it("listOffersForBuyer roda contra o banco", async () => {
    const world = await seedWorld();
    await offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), {
      ad_id: world.adIds[0],
    });

    const result = await offers.listReceivedOffers(
      String(world.buyerId),
      String(world.intentId)
    );
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].vehicle.vehicle_name).toBe("Honda HR-V");
    expect(result.offers[0].dealer.name).toBe("ittmotors");
  }, 180000);

  /**
   * Fase 3.1 — `getOfferContactForBuyer` contra o banco real.
   *
   * Mesma lição do `SELECT a.image_url`: o fake devolve o que a projeção dele
   * inventar, então uma coluna inexistente em `advertisers` passaria por toda a
   * suíte unitária e só quebraria em produção, no clique do comprador. Este
   * caso existe para que a query com o COALESCE de três colunas execute de
   * verdade pelo menos uma vez.
   */
  it("resolveOfferWhatsapp roda contra o banco e devolve wa.me com a mensagem", async () => {
    const world = await seedWorld();
    await pool.query(`UPDATE advertisers SET whatsapp = '(11) 99999-9999' WHERE id = $1`, [
      world.advertiserId,
    ]);

    const sent = await offers.sendVehicleToBuyer(
      String(world.dealerId),
      String(world.intentId),
      { ad_id: world.adIds[0] }
    );

    const result = await offers.resolveOfferWhatsapp(
      String(world.buyerId),
      String(world.intentId),
      String(sent.offer.id)
    );

    const url = new URL(result.url);
    expect(url.host).toBe("wa.me");
    expect(url.pathname).toBe("/5511999999999");
    expect(decodeURIComponent(url.searchParams.get("text"))).toBe(
      "Olá! Recebi pelo Carros na Cidade a opção do Honda HR-V 2020 e gostaria de agendar uma visita para conhecer o veículo."
    );
  }, 180000);

  it("a precedência COALESCE(whatsapp, mobile_phone, phone) vale no banco real", async () => {
    const world = await seedWorld();
    const sent = await offers.sendVehicleToBuyer(
      String(world.dealerId),
      String(world.intentId),
      { ad_id: world.adIds[0] }
    );

    const whatsappOf = async () => {
      const result = await offers.resolveOfferWhatsapp(
        String(world.buyerId),
        String(world.intentId),
        String(sent.offer.id)
      );
      return new URL(result.url).pathname;
    };

    await pool.query(
      `UPDATE advertisers SET whatsapp = $2, mobile_phone = $3, phone = $4 WHERE id = $1`,
      [world.advertiserId, "(11) 91111-1111", "(11) 92222-2222", "(11) 93333-3333"]
    );
    expect(await whatsappOf()).toBe("/5511911111111");

    await pool.query(`UPDATE advertisers SET whatsapp = NULL WHERE id = $1`, [
      world.advertiserId,
    ]);
    expect(await whatsappOf()).toBe("/5511922222222");

    await pool.query(`UPDATE advertisers SET mobile_phone = NULL WHERE id = $1`, [
      world.advertiserId,
    ]);
    expect(await whatsappOf()).toBe("/5511933333333");

    // Sem nenhum dos três: erro de DOMÍNIO, não 500.
    await pool.query(`UPDATE advertisers SET phone = NULL WHERE id = $1`, [world.advertiserId]);
    await expect(
      offers.resolveOfferWhatsapp(
        String(world.buyerId),
        String(world.intentId),
        String(sent.offer.id)
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      details: { code: "DEALER_WHATSAPP_UNAVAILABLE" },
    });
  }, 180000);

  it("IDOR: outro comprador e oferta de outra procura recebem 404 no banco real", async () => {
    const world = await seedWorld();
    await pool.query(`UPDATE advertisers SET whatsapp = '(11) 99999-9999' WHERE id = $1`, [
      world.advertiserId,
    ]);

    const sent = await offers.sendVehicleToBuyer(
      String(world.dealerId),
      String(world.intentId),
      { ad_id: world.adIds[0] }
    );

    // Outro comprador, com procura própria.
    const { rows: otherRows } = await pool.query(
      `INSERT INTO users (email, password_hash, name, document_type)
       VALUES ('outro@conc.test', 'x', 'Outro', 'cpf') RETURNING id`
    );
    const otherBuyerId = otherRows[0].id;

    const { rows: otherIntentRows } = await pool.query(
      `INSERT INTO purchase_intents (
         buyer_user_id, city_id, intent_type, brand, brand_slug, model, model_slug,
         transmission, max_price, purchase_timeframe, status, expires_at
       )
       VALUES ($1, $2, 'specific_model', 'Honda', 'honda', 'HR-V', 'hr-v',
               'automatico', 100000, 'within_30_days', 'active', NOW() + INTERVAL '30 days')
       RETURNING id`,
      [otherBuyerId, world.cityId]
    );
    const otherIntentId = otherIntentRows[0].id;

    // §39 — comprador B pedindo a oferta de A.
    await expect(
      offers.resolveOfferWhatsapp(
        String(otherBuyerId),
        String(world.intentId),
        String(sent.offer.id)
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    // §40 — oferta de A pendurada na procura de B.
    await expect(
      offers.resolveOfferWhatsapp(
        String(otherBuyerId),
        String(otherIntentId),
        String(sent.offer.id)
      )
    ).rejects.toMatchObject({ statusCode: 404 });

    // E o dono legítimo continua conseguindo.
    await expect(
      offers.resolveOfferWhatsapp(
        String(world.buyerId),
        String(world.intentId),
        String(sent.offer.id)
      )
    ).resolves.toHaveProperty("url");
  }, 180000);

  it("anúncio pausado e loja bloqueada cortam o contato no banco real", async () => {
    for (const setup of [
      { label: "anúncio pausado", sql: `UPDATE ads SET status = 'paused' WHERE id = $1`, ad: true },
      {
        label: "loja bloqueada",
        sql: `UPDATE advertisers SET status = 'blocked' WHERE id = $1`,
        ad: false,
      },
    ]) {
      const world = await seedWorld();
      await pool.query(`UPDATE advertisers SET whatsapp = '(11) 99999-9999' WHERE id = $1`, [
        world.advertiserId,
      ]);

      const sent = await offers.sendVehicleToBuyer(
        String(world.dealerId),
        String(world.intentId),
        { ad_id: world.adIds[0] }
      );

      await pool.query(setup.sql, [setup.ad ? world.adIds[0] : world.advertiserId]);

      await expect(
        offers.resolveOfferWhatsapp(
          String(world.buyerId),
          String(world.intentId),
          String(sent.offer.id)
        ),
        setup.label
      ).rejects.toMatchObject({
        statusCode: 409,
        details: { code: "PURCHASE_INTENT_OFFER_UNAVAILABLE" },
      });
    }
  }, 180000);
});

describe.sequential("integração — limite de 3 sob concorrência real", () => {
  it("quatro envios SIMULTÂNEOS resultam em EXATAMENTE 3 relações", async () => {
    const world = await seedWorld();

    const results = await Promise.allSettled(
      world.adIds.map((adId) =>
        offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), { ad_id: adId })
      )
    );

    const created = results.filter(
      (item) => item.status === "fulfilled" && item.value.created === true
    );
    const rejected = results.filter((item) => item.status === "rejected");

    expect(created).toHaveLength(3);
    expect(rejected).toHaveLength(1);

    // A recusa precisa ser o código de DOMÍNIO, não um 500 de deadlock nem uma
    // violação de constraint vazando crua para o cliente.
    expect(rejected[0].reason).toMatchObject({
      statusCode: 409,
      details: { code: "PURCHASE_INTENT_OFFER_LIMIT_REACHED" },
    });

    expect(await countOffers(world.intentId)).toBe(3);
  }, 180000);

  it("o resultado é ESTÁVEL: cinco rodadas, sempre exatamente 3", async () => {
    // Corrida é probabilística. Uma rodada que passa pode ser sorte; cinco
    // rodadas seguidas com o mesmo resultado é evidência de que a serialização
    // existe, e não de que a janela é estreita.
    for (let round = 1; round <= 5; round += 1) {
      const world = await seedWorld();

      const results = await Promise.allSettled(
        world.adIds.map((adId) =>
          offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), { ad_id: adId })
        )
      );

      const created = results.filter(
        (item) => item.status === "fulfilled" && item.value.created === true
      );

      expect(created, `rodada ${round}`).toHaveLength(3);
      expect(await countOffers(world.intentId), `rodada ${round}`).toBe(3);
    }
  }, 300000);

  it("quatro envios simultâneos do MESMO anúncio criam UMA linha só", async () => {
    // Clique duplo / retry de rede. Aqui quem protege é o índice único, e o
    // service transforma a perda da corrida em resposta idempotente — não em
    // erro 500.
    const world = await seedWorld();
    const adId = world.adIds[0];

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), { ad_id: adId })
      )
    );

    expect(results.filter((item) => item.status === "rejected")).toHaveLength(0);
    expect(
      results.filter((item) => item.status === "fulfilled" && item.value.created === true)
    ).toHaveLength(1);
    expect(
      results.filter((item) => item.status === "fulfilled" && item.value.already_sent === true)
    ).toHaveLength(3);

    expect(await countOffers(world.intentId)).toBe(1);
  }, 180000);

  /**
   * ATENÇÃO AO STATUS USADO AQUI.
   *
   * A especificação da fase descreve este cenário como "ad1 → sold". Só que
   * `sold` NÃO é gravável neste banco: o `ads_status_check` (migration 032)
   * aceita apenas active | pending_review | paused | rejected | blocked |
   * deleted | archived, e o comentário da própria migration é explícito —
   * "draft/sold/expired ainda fora do CHECK até ter caminho de escrita real".
   *
   * `sold` existe em `AD_STATUS` (JS) mas nenhum service o escreve. Usá-lo aqui
   * fazia o teste morrer com violação de CHECK, e o teste estaria provando um
   * cenário que o produto não consegue produzir.
   *
   * `paused` é o equivalente REAL e alcançável: o dono pausa o anúncio pelo
   * painel. O código não distingue os dois — ele compara com ACTIVE — então a
   * regra provada é a mesma, agora com um estado que existe de verdade.
   */
  it("veículo indisponível libera a vaga, e o quarto envio passa", async () => {
    const world = await seedWorld();

    for (const adId of world.adIds.slice(0, 3)) {
      const result = await offers.sendVehicleToBuyer(
        String(world.dealerId),
        String(world.intentId),
        { ad_id: adId }
      );
      expect(result.created).toBe(true);
    }

    await expect(
      offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), {
        ad_id: world.adIds[3],
      })
    ).rejects.toMatchObject({ details: { code: "PURCHASE_INTENT_OFFER_LIMIT_REACHED" } });

    await pool.query(`UPDATE ads SET status = 'paused' WHERE id = $1`, [world.adIds[0]]);

    const fourth = await offers.sendVehicleToBuyer(
      String(world.dealerId),
      String(world.intentId),
      { ad_id: world.adIds[3] }
    );
    expect(fourth.created).toBe(true);

    // A relação do carro pausado continua no histórico — 4 linhas, não 3.
    expect(await countOffers(world.intentId)).toBe(4);
  }, 180000);

  it("o CHECK de ads.status é o que ele é — e o teste sabe disso", async () => {
    // Documenta a descoberta acima DENTRO da suíte, para que a próxima pessoa
    // que escrever `status = 'sold'` num teste veja o motivo em vez de um
    // "violates check constraint" solto.
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'ads_status_check'`
    );
    const def = rows[0]?.def ?? "";

    for (const writable of ["active", "paused", "blocked", "archived", "rejected", "deleted"]) {
      expect(def, `${writable} deveria ser gravável`).toContain(writable);
    }
    // Ainda fora do CHECK, por decisão da migration 032 — não é esquecimento.
    expect(def).not.toContain("sold");
    expect(def).not.toContain("expired");
    expect(def).not.toContain("draft");
  }, 180000);

  it("o comprador vê o preço ATUAL do anúncio, não o da hora do envio", async () => {
    const world = await seedWorld();
    await offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), {
      ad_id: world.adIds[0],
    });

    await pool.query(`UPDATE ads SET price = 96900, mileage = 74000 WHERE id = $1`, [
      world.adIds[0],
    ]);

    const result = await offers.listReceivedOffers(
      String(world.buyerId),
      String(world.intentId)
    );
    expect(result.offers).toHaveLength(1);
    expect(Number(result.offers[0].vehicle.price)).toBe(96900);
    expect(result.offers[0].vehicle.mileage).toBe(74000);
    expect(result.offers[0].vehicle.available).toBe(true);
  }, 180000);

  it("anúncio fora do ar aparece INDISPONÍVEL para o comprador, sem sumir", async () => {
    // Percorre os estados REALMENTE graváveis (ver o teste do CHECK acima).
    for (const status of ["paused", "blocked", "archived", "rejected", "deleted"]) {
      const world = await seedWorld();
      await offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), {
        ad_id: world.adIds[0],
      });

      await pool.query(`UPDATE ads SET status = $2 WHERE id = $1`, [world.adIds[0], status]);

      const result = await offers.listReceivedOffers(
        String(world.buyerId),
        String(world.intentId)
      );
      expect(result.offers, `status ${status}`).toHaveLength(1);
      expect(result.offers[0].vehicle.available, `status ${status}`).toBe(false);
    }
  }, 180000);

  it("loja bloqueada depois do envio torna o card indisponível", async () => {
    const world = await seedWorld();
    await offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), {
      ad_id: world.adIds[0],
    });

    await pool.query(`UPDATE advertisers SET status = 'blocked' WHERE id = $1`, [
      world.advertiserId,
    ]);

    const result = await offers.listReceivedOffers(
      String(world.buyerId),
      String(world.intentId)
    );
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].vehicle.available).toBe(false);
  }, 180000);
});
