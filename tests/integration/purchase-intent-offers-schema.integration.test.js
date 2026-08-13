import dotenv from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * Schema REAL de `purchase_intent_offers`, contra um PostgreSQL de verdade.
 *
 * Os testes unitários provam que o SERVIÇO se comporta. Eles não podem provar
 * que o BANCO recusa uma linha torta — o fake implementa a regra e depois
 * concorda consigo mesmo. Aqui a garantia é exercitada onde ela mora:
 *
 *   • a tabela existe com as colunas conceituais da fase;
 *   • FK de `purchase_intent_id` para `purchase_intents` com CASCADE;
 *   • FK de `dealer_user_id` para `users`;
 *   • FK de `ad_id` para `ads` — e ela IMPEDE anúncio inexistente;
 *   • UNIQUE (purchase_intent_id, ad_id) recusa o duplicado DE VERDADE;
 *   • os índices de leitura e de contagem existem;
 *   • NÃO existe cópia do veículo (price/photos/mileage/brand/model/year);
 *   • apagar a procura leva as ofertas junto; apagar o anúncio também.
 *
 * A CONCORRÊNCIA do limite de 3 tem arquivo próprio
 * (purchase-intent-offers-concurrency.integration.test.js), porque exige o
 * SERVICE rodando contra este banco — e não SQL escrito à mão que provaria
 * apenas que o Postgres sabe travar linha.
 *
 * Banco temporário por caso, criado e destruído no próprio teste. Não toca
 * banco de desenvolvimento nem de produção.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/purchase-intent-offers-schema.integration.test.js
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
const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}
const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));

function makeDbName(label) {
  return `pioffer_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
}
function makeDatabaseUrl(dbName) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}
function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}
async function dropDatabase(dbName) {
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
}
async function withMigratedDatabase(label, callback) {
  const dbName = makeDbName(label);
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
  const dbUrl = makeDatabaseUrl(dbName);

  try {
    await runMigrations(dbUrl);
    const pool = new Pool(buildPoolConfig(dbUrl));
    try {
      return await callback(pool);
    } finally {
      await pool.end().catch(() => {});
    }
  } finally {
    await dropDatabase(dbName);
  }
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

// --- fixtures mínimas -------------------------------------------------------

async function createUser(pool, email) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ($1, 'x', 'Teste', 'cnpj') RETURNING id`,
    [email]
  );
  return rows[0].id;
}

async function createCity(pool, slug) {
  const { rows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', $1) RETURNING id`,
    [slug]
  );
  return rows[0].id;
}

async function createAdvertiser(pool, { userId, cityId, slug }) {
  const { rows } = await pool.query(
    `INSERT INTO advertisers (user_id, city_id, name, slug, status)
     VALUES ($1, $2, 'ittmotors', $3, 'active') RETURNING id`,
    [userId, cityId, slug]
  );
  return rows[0].id;
}

async function createAd(pool, { advertiserId, cityId, slug }) {
  const { rows } = await pool.query(
    `INSERT INTO ads (advertiser_id, city_id, title, price, brand, model, year, mileage,
                      transmission, body_type, status, slug, images)
     VALUES ($1, $2, 'Honda HR-V EX 2020', 98900, 'Honda', 'HR-V EX 1.8 Flex 16V 5p Aut.',
             2020, 72000, 'automatico', 'suv', 'active', $3, '[]'::jsonb)
     RETURNING id`,
    [advertiserId, cityId, slug]
  );
  return rows[0].id;
}

async function createIntent(pool, { buyerUserId, cityId }) {
  const { rows } = await pool.query(
    `INSERT INTO purchase_intents (
       buyer_user_id, city_id, intent_type, brand, brand_slug, model, model_slug,
       transmission, max_price, purchase_timeframe, status, expires_at
     )
     VALUES ($1, $2, 'specific_model', 'Honda', 'honda', 'HR-V', 'hr-v',
             'automatico', 100000, 'within_30_days', 'active', NOW() + INTERVAL '30 days')
     RETURNING id`,
    [buyerUserId, cityId]
  );
  return rows[0].id;
}

/** Cenário completo num único banco: comprador, loja, anúncio e procura. */
async function seedWorld(pool, tag) {
  const buyer = await createUser(pool, `buyer-${tag}@test.local`);
  const dealer = await createUser(pool, `dealer-${tag}@test.local`);
  const cityId = await createCity(pool, `atibaia-${tag}`);
  const advertiserId = await createAdvertiser(pool, {
    userId: dealer,
    cityId,
    slug: `loja-${tag}`,
  });
  const adId = await createAd(pool, { advertiserId, cityId, slug: `hrv-${tag}` });
  const intentId = await createIntent(pool, { buyerUserId: buyer, cityId });

  return { buyer, dealer, cityId, advertiserId, adId, intentId };
}

async function listColumns(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1
      ORDER BY ordinal_position ASC`,
    [tableName]
  );
  return rows;
}

afterAll(async () => {
  await adminPool.end().catch(() => {});
});

describe.sequential("integração — schema de purchase_intent_offers", () => {
  it("cria a tabela e NÃO guarda cópia do veículo", async () => {
    await withMigratedDatabase("cols", async (pool) => {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'purchase_intent_offers'`
      );
      expect(rowCount).toBe(1);

      const columns = await listColumns(pool, "purchase_intent_offers");
      const names = columns.map((c) => c.column_name).sort();

      // A tabela inteira é a relação e mais nada.
      expect(names).toEqual(
        ["ad_id", "created_at", "dealer_user_id", "id", "purchase_intent_id"].sort()
      );

      // A garantia central da fase: o anúncio continua sendo a única fonte de
      // verdade do veículo. Qualquer uma destas colunas seria uma cópia que
      // envelhece — e o preço mostrado ao comprador passaria a discordar do
      // preço do anúncio.
      for (const forbidden of [
        "price",
        "images",
        "photos",
        "mileage",
        "brand",
        "model",
        "year",
        "title",
        "dealer_name",
        "slug",
        "status",
      ]) {
        expect(names, `purchase_intent_offers não pode ter ${forbidden}`).not.toContain(forbidden);
      }

      const byName = Object.fromEntries(columns.map((c) => [c.column_name, c]));
      expect(byName.purchase_intent_id.is_nullable).toBe("NO");
      expect(byName.dealer_user_id.is_nullable).toBe("NO");
      expect(byName.ad_id.is_nullable).toBe("NO");
    });
  }, 180000);

  it("tem as três FKs, com o CASCADE de cada uma", async () => {
    await withMigratedDatabase("fks", async (pool) => {
      const { rows } = await pool.query(
        `SELECT pg_get_constraintdef(c.oid) AS def
             FROM pg_constraint c
             JOIN pg_class rel ON rel.oid = c.conrelid
            WHERE rel.relname = 'purchase_intent_offers' AND c.contype = 'f'`
      );
      const joined = rows.map((r) => r.def).join(" ");

      expect(joined).toMatch(
        /FOREIGN KEY \(purchase_intent_id\) REFERENCES purchase_intents\(id\)/i
      );
      expect(joined).toMatch(/FOREIGN KEY \(purchase_intent_id\)[^,]*ON DELETE CASCADE/i);

      expect(joined).toMatch(/FOREIGN KEY \(dealer_user_id\) REFERENCES users\(id\)/i);

      // A FK para `ads` é o que prova que a ponte da Fase 3 existe de verdade.
      expect(joined).toMatch(/FOREIGN KEY \(ad_id\) REFERENCES ads\(id\)/i);
    });
  }, 180000);

  it("a FK de anúncio recusa ad_id inexistente", async () => {
    await withMigratedDatabase("fkad", async (pool) => {
      const world = await seedWorld(pool, "fkad");

      await expect(
        pool.query(
          `INSERT INTO purchase_intent_offers (purchase_intent_id, dealer_user_id, ad_id)
           VALUES ($1, $2, $3)`,
          [world.intentId, world.dealer, 999999]
        )
      ).rejects.toMatchObject({ code: "23503" });
    });
  }, 180000);

  it("o UNIQUE (procura, anúncio) recusa o duplicado no BANCO", async () => {
    await withMigratedDatabase("unique", async (pool) => {
      const world = await seedWorld(pool, "unique");

      const insert = `INSERT INTO purchase_intent_offers (purchase_intent_id, dealer_user_id, ad_id)
                      VALUES ($1, $2, $3)`;
      const values = [world.intentId, world.dealer, world.adId];

      await expect(pool.query(insert, values)).resolves.toBeTruthy();

      // É esta violação que o service transforma em resposta idempotente. Sem
      // ela, dois cliques simultâneos criariam duas linhas.
      await expect(pool.query(insert, values)).rejects.toMatchObject({ code: "23505" });

      // E o `ON CONFLICT DO NOTHING` do repository não cria nem lança.
      const conflict = await pool.query(
        `${insert} ON CONFLICT (purchase_intent_id, ad_id) DO NOTHING RETURNING id`,
        values
      );
      expect(conflict.rowCount).toBe(0);

      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM purchase_intent_offers`);
      expect(rows[0].n).toBe(1);
    });
  }, 180000);

  it("cria os índices de leitura do comprador e de contagem por lojista", async () => {
    await withMigratedDatabase("idx", async (pool) => {
      const { rows } = await pool.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'purchase_intent_offers'`
      );
      const defs = rows.map((r) => r.indexdef).join(" ");

      // Listagem do comprador ("veículos enviados para você").
      expect(defs).toMatch(/purchase_intent_id, created_at DESC, id DESC/i);
      // Contagem de vagas ocupadas por lojista dentro da procura.
      expect(defs).toMatch(/purchase_intent_id, dealer_user_id, created_at DESC, id DESC/i);
      // O próprio UNIQUE é o índice de duplicidade.
      expect(defs).toMatch(/UNIQUE INDEX[^)]*\(purchase_intent_id, ad_id\)/i);
    });
  }, 180000);

  it("apagar a procura leva as ofertas junto (CASCADE)", async () => {
    await withMigratedDatabase("cascadeintent", async (pool) => {
      const world = await seedWorld(pool, "cascadeintent");
      await pool.query(
        `INSERT INTO purchase_intent_offers (purchase_intent_id, dealer_user_id, ad_id)
         VALUES ($1, $2, $3)`,
        [world.intentId, world.dealer, world.adId]
      );

      await pool.query(`DELETE FROM purchase_intents WHERE id = $1`, [world.intentId]);

      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM purchase_intent_offers`);
      expect(rows[0].n).toBe(0);
    });
  }, 180000);

  it("apagar o anúncio não trava a manutenção (CASCADE)", async () => {
    // `scripts/cleanup-orphan-test-ads.mjs` e `scripts/e2e-seed.mjs` REALMENTE
    // executam DELETE FROM ads. Com NO ACTION, esses scripts passariam a falhar
    // com violação de FK — este teste é o que impede a regressão silenciosa.
    await withMigratedDatabase("cascadead", async (pool) => {
      const world = await seedWorld(pool, "cascadead");
      await pool.query(
        `INSERT INTO purchase_intent_offers (purchase_intent_id, dealer_user_id, ad_id)
         VALUES ($1, $2, $3)`,
        [world.intentId, world.dealer, world.adId]
      );

      await expect(pool.query(`DELETE FROM ads WHERE id = $1`, [world.adId])).resolves.toBeTruthy();

      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM purchase_intent_offers`);
      expect(rows[0].n).toBe(0);
    });
  }, 180000);

  it("a migration 050 continua intacta — a ponte nasceu na 051", async () => {
    await withMigratedDatabase("mig", async (pool) => {
      // `purchase_intents` não ganhou coluna nenhuma de estoque. Se alguém
      // "resolvesse" a Fase 3 pondo `ad_id` lá, este teste falha.
      const columns = (await listColumns(pool, "purchase_intents")).map((c) => c.column_name);
      expect(columns).not.toContain("ad_id");
      expect(columns).not.toContain("advertiser_id");
      expect(columns).not.toContain("offer_id");

      const { rows } = await pool.query(
        `SELECT filename FROM schema_migrations WHERE filename LIKE '05%' ORDER BY filename`
      );
      const names = rows.map((r) => r.filename);
      expect(names).toContain("050_purchase_intents.sql");
      expect(names).toContain("051_purchase_intent_offers.sql");
    });
  }, 180000);
});
