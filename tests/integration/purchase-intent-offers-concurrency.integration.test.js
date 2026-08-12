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

  it("veículo vendido libera a vaga, e o quarto envio passa", async () => {
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

    await pool.query(`UPDATE ads SET status = 'sold' WHERE id = $1`, [world.adIds[0]]);

    const fourth = await offers.sendVehicleToBuyer(
      String(world.dealerId),
      String(world.intentId),
      { ad_id: world.adIds[3] }
    );
    expect(fourth.created).toBe(true);

    // A relação do carro vendido continua no histórico — 4 linhas, não 3.
    expect(await countOffers(world.intentId)).toBe(4);
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

  it("anúncio vendido aparece INDISPONÍVEL para o comprador, sem sumir", async () => {
    const world = await seedWorld();
    await offers.sendVehicleToBuyer(String(world.dealerId), String(world.intentId), {
      ad_id: world.adIds[0],
    });

    await pool.query(`UPDATE ads SET status = 'sold' WHERE id = $1`, [world.adIds[0]]);

    const result = await offers.listReceivedOffers(
      String(world.buyerId),
      String(world.intentId)
    );
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].vehicle.available).toBe(false);
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
