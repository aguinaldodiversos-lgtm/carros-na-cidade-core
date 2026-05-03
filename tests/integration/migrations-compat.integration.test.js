import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

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
  return {
    connectionString,
    ssl: resolveSslConfig(connectionString, process.env),
  };
}

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));

function makeDbName(label) {
  return `mig_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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

async function createDatabase(dbName) {
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);
}

async function dropDatabase(dbName) {
  await adminPool.query(
    `
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1
      AND pid <> pg_backend_pid()
    `,
    [dbName]
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
}

async function withDatabase(label, callback) {
  const dbName = makeDbName(label);
  await createDatabase(dbName);

  try {
    return await callback({
      dbName,
      dbUrl: makeDatabaseUrl(dbName),
    });
  } finally {
    await dropDatabase(dbName);
  }
}

async function openPool(connectionString) {
  const pool = new Pool(buildPoolConfig(connectionString));
  await pool.query("SELECT 1");
  return pool;
}

function buildBaseEnv(dbUrl) {
  return {
    ...process.env,
    DATABASE_URL: dbUrl,
    TEST_DATABASE_URL: dbUrl,
    NODE_ENV: "test",
    RUN_WORKERS: "false",
    JWT_SECRET:
      process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-compat",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET || "integration-refresh-secret-minimum-32-characters-long",
  };
}

async function runNodeScript(relativeEntryPath, extraEnv = {}) {
  const entryPath = path.join(workspaceRoot, relativeEntryPath);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`Processo ${relativeEntryPath} falhou (${code}).\n${output}`));
    });
  });
}

async function startServerAndWait(extraEnv = {}) {
  const entryPath = path.join(workspaceRoot, "src/index.js");

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Boot não ficou saudável em tempo hábil.\n${output}`));
    }, 30000);

    const onData = (chunk) => {
      output += chunk.toString();
      if (!settled && output.includes("api online")) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, output });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Servidor encerrou antes de ficar pronto (${code}).\n${output}`));
    });
  });
}

async function stopServer(child) {
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
    }, 10000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function listColumns(pool, tableName) {
  const result = await pool.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = $1
    ORDER BY ordinal_position ASC
    `,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function getMigrationFilenames(pool) {
  const result = await pool.query(
    `
    SELECT filename
    FROM schema_migrations
    WHERE filename IS NOT NULL
    ORDER BY filename ASC
    `
  );
  return result.rows.map((row) => row.filename);
}

async function seedLegacyPartialSchema(pool) {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      password TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE cities (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      state TEXT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE advertisers (
      id BIGSERIAL PRIMARY KEY,
      email TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE ads (
      id BIGSERIAL PRIMARY KEY,
      price NUMERIC(14, 2),
      brand TEXT,
      model TEXT,
      year INTEGER
    );
  `);
}

async function seedLegacyTrackingSchema(pool) {
  await seedLegacyPartialSchema(pool);
  await pool.query(`
    CREATE TABLE schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `
    INSERT INTO schema_migrations (filename)
    VALUES
      ('001_baseline_cities.sql'),
      ('002_baseline_users.sql'),
      ('003_baseline_advertisers.sql'),
      ('004_baseline_ads.sql')
    `
  );
}

// Backfill SQL idêntico ao corpo da migration 020. Mantido aqui para o teste
// poder reaplicá-lo em rows inseridas após a migration original ter rodado e
// validar que cada vocabulário legado vira o ID novo correto.
const PLAN_ID_BACKFILL_SQL = `
  UPDATE users
  SET plan_id = CASE
    WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'free' AND UPPER(COALESCE(document_type, '')) = 'CNPJ'
      THEN 'cnpj-free-store'
    WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'start'
      THEN 'cnpj-store-start'
    WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'pro'
      THEN 'cnpj-store-pro'
    WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'evento-premium'
      THEN 'cnpj-evento-premium'
    ELSE 'cpf-free-essential'
  END
  WHERE plan_id IS NULL
`;

describe.sequential("integração — compatibilidade de migrations", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("aplica migrations em banco novo do zero com schema_migrations canônico", async () => {
    await withDatabase("fresh", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        const migrationColumns = await listColumns(db, "schema_migrations");
        expect(migrationColumns.has("filename")).toBe(true);
        expect(migrationColumns.has("executed_at")).toBe(true);

        const userColumns = await listColumns(db, "users");
        expect(userColumns.has("reset_token")).toBe(true);
        expect(userColumns.has("email_verification_token")).toBe(true);

        const adColumns = await listColumns(db, "ads");
        expect(adColumns.has("images")).toBe(true);

        const filenames = await getMigrationFilenames(db);
        expect(filenames).toContain("012_core_schema_compatibility.sql");
        expect(filenames).toContain("020_subscription_plans_and_billing.sql");
        expect(filenames.length).toBeGreaterThanOrEqual(13);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("020 cria subscription_plans + billing e popula 6 planos canônicos", async () => {
    await withDatabase("billing_schema", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        const planColumns = await listColumns(db, "subscription_plans");
        expect(planColumns.has("priority_level")).toBe(true);
        expect(planColumns.has("billing_model")).toBe(true);
        expect(planColumns.has("ad_limit")).toBe(true);
        expect(planColumns.has("benefits")).toBe(true);

        const subscriptionColumns = await listColumns(db, "user_subscriptions");
        expect(subscriptionColumns.has("plan_id")).toBe(true);
        expect(subscriptionColumns.has("expires_at")).toBe(true);

        const paymentColumns = await listColumns(db, "payments");
        expect(paymentColumns.has("mercado_pago_id")).toBe(true);
        expect(paymentColumns.has("plan_id")).toBe(true);

        const intentColumns = await listColumns(db, "payment_intents");
        expect(intentColumns.has("context")).toBe(true);
        expect(intentColumns.has("payment_resource_id")).toBe(true);

        const userColumns = await listColumns(db, "users");
        expect(userColumns.has("plan_id")).toBe(true);

        const seededPlans = await db.query(
          `SELECT id FROM subscription_plans ORDER BY id ASC`
        );
        const seededIds = seededPlans.rows.map((row) => row.id);
        expect(seededIds).toEqual([
          "cnpj-evento-premium",
          "cnpj-free-store",
          "cnpj-store-pro",
          "cnpj-store-start",
          "cpf-free-essential",
          "cpf-premium-highlight",
        ]);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("backfill da 020 traduz vocabulário legado (free/start/pro) para IDs novos", async () => {
    await withDatabase("billing_backfill", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        // Insere usuários com vocabulário antigo, plan_id=null para forçar
        // o backfill (mesma forma que a migration trataria registros pré-020).
        await db.query(
          `
          INSERT INTO users (email, plan, document_type, plan_id) VALUES
            ('cpf-free@test.local',   'free', 'cpf',  NULL),
            ('cnpj-free@test.local',  'free', 'cnpj', NULL),
            ('start@test.local',      'start', 'cnpj', NULL),
            ('pro@test.local',        'pro', 'cnpj', NULL),
            ('evento@test.local',     'evento-premium', 'cnpj', NULL),
            ('null-plan@test.local',  NULL,   NULL,   NULL)
          `
        );

        await db.query(PLAN_ID_BACKFILL_SQL);

        const result = await db.query(
          `SELECT email, plan_id FROM users WHERE email LIKE '%@test.local' ORDER BY email ASC`
        );
        const byEmail = Object.fromEntries(
          result.rows.map((row) => [row.email, row.plan_id])
        );

        expect(byEmail["cpf-free@test.local"]).toBe("cpf-free-essential");
        expect(byEmail["cnpj-free@test.local"]).toBe("cnpj-free-store");
        expect(byEmail["start@test.local"]).toBe("cnpj-store-start");
        expect(byEmail["pro@test.local"]).toBe("cnpj-store-pro");
        expect(byEmail["evento@test.local"]).toBe("cnpj-evento-premium");
        expect(byEmail["null-plan@test.local"]).toBe("cpf-free-essential");
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("recupera banco legado parcial sem crash e adiciona colunas obrigatórias", async () => {
    await withDatabase("partial", async ({ dbUrl }) => {
      const db = await openPool(dbUrl);
      try {
        await seedLegacyPartialSchema(db);
      } finally {
        await db.end();
      }

      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const migratedDb = await openPool(dbUrl);
      try {
        const userColumns = await listColumns(migratedDb, "users");
        expect(userColumns.has("password_hash")).toBe(true);
        expect(userColumns.has("failed_attempts")).toBe(true);
        expect(userColumns.has("reset_token")).toBe(true);

        const advertiserColumns = await listColumns(migratedDb, "advertisers");
        expect(advertiserColumns.has("user_id")).toBe(true);
        expect(advertiserColumns.has("slug")).toBe(true);

        const adColumns = await listColumns(migratedDb, "ads");
        expect(adColumns.has("slug")).toBe(true);
        expect(adColumns.has("images")).toBe(true);
        expect(adColumns.has("below_fipe")).toBe(true);

        const refreshColumns = await listColumns(migratedDb, "refresh_tokens");
        expect(refreshColumns.has("token_hash")).toBe(true);
        expect(refreshColumns.has("revoked")).toBe(true);
      } finally {
        await migratedDb.end();
      }
    });
  }, 120000);

  it("entende schema_migrations legado com id serial e continua registrando novas migrations", async () => {
    await withDatabase("legacy_tracking", async ({ dbUrl }) => {
      const db = await openPool(dbUrl);
      try {
        await seedLegacyTrackingSchema(db);
      } finally {
        await db.end();
      }

      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const migratedDb = await openPool(dbUrl);
      try {
        const migrationColumns = await listColumns(migratedDb, "schema_migrations");
        expect(migrationColumns.has("filename")).toBe(true);

        const filenames = await getMigrationFilenames(migratedDb);
        expect(filenames).toContain("001_baseline_cities.sql");
        expect(filenames).toContain("012_core_schema_compatibility.sql");

        const compatUserColumns = await listColumns(migratedDb, "users");
        expect(compatUserColumns.has("email_verification_token")).toBe(true);
      } finally {
        await migratedDb.end();
      }
    });
  }, 120000);

  it("022 adiciona seo_publications.is_indexable quando a tabela existe (criada out-of-band em prod)", async () => {
    await withDatabase("seo_pub_is_indexable", async ({ dbUrl }) => {
      // Pré-condição: simular o estado real de produção, onde
      // `seo_publications` foi criada fora das migrations (ver
      // docs/runbooks/sitemap-empty-investigation.md §5) e nunca recebeu
      // a coluna `is_indexable`. Schema mínimo suficiente para reproduzir
      // a query LEFT JOIN do `public-seo.service.js#listEntries` que
      // quebrava com PostgreSQL 42703.
      const seedDb = await openPool(dbUrl);
      try {
        await seedDb.query(`
          CREATE TABLE seo_publications (
            id SERIAL PRIMARY KEY,
            cluster_plan_id INTEGER,
            path TEXT NOT NULL UNIQUE,
            title TEXT,
            status TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            published_at TIMESTAMPTZ
          );
        `);
        await seedDb.query(
          `INSERT INTO seo_publications (path, status) VALUES ('/cidade/legacy-row-tt', 'published')`
        );
      } finally {
        await seedDb.end();
      }

      // Roda migrations (incluindo 022) sobre a tabela legada.
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        // 1. Migration 022 foi registrada.
        const filenames = await getMigrationFilenames(db);
        expect(filenames).toContain("022_seo_publications_is_indexable.sql");

        // 2. Coluna existe, com tipo boolean, NOT NULL, DEFAULT TRUE.
        const colMeta = await db.query(
          `
          SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'seo_publications'
            AND column_name = 'is_indexable'
          `
        );
        expect(colMeta.rows).toHaveLength(1);
        expect(colMeta.rows[0].data_type).toBe("boolean");
        expect(colMeta.rows[0].is_nullable).toBe("NO");
        expect(String(colMeta.rows[0].column_default).toLowerCase()).toContain("true");

        // 3. Linhas pré-existentes ficaram is_indexable = true (default
        //    aplicado retroativamente — comportamento padrão do Postgres
        //    para ADD COLUMN ... NOT NULL DEFAULT <const>).
        const legacyRow = await db.query(
          `SELECT is_indexable FROM seo_publications WHERE path = '/cidade/legacy-row-tt'`
        );
        expect(legacyRow.rows[0].is_indexable).toBe(true);

        // 4. O SELECT do public-seo.service.js que quebrava (HTTP 500
        //    "column sp.is_indexable does not exist" / código 42703) agora
        //    roda. Não esperamos resultados — só validamos que não levanta.
        await expect(
          db.query(
            `
            SELECT sp.id
            FROM seo_publications sp
            WHERE (sp.id IS NULL OR sp.is_indexable = TRUE)
              AND (sp.id IS NULL OR sp.status IN ('published', 'review_required'))
            `
          )
        ).resolves.toBeDefined();

        // 5. Idempotência: rodar migrations de novo é no-op (não duplica
        //    coluna, não falha por já existir).
        await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
        const colMetaAfter = await db.query(
          `
          SELECT COUNT(*)::int AS n
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'seo_publications'
            AND column_name = 'is_indexable'
          `
        );
        expect(colMetaAfter.rows[0].n).toBe(1);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("022 é no-op quando seo_publications não existe (fresh DB sem schema legado)", async () => {
    // Em CI/test default, nenhuma migration cria seo_publications. A 022
    // precisa ser silenciosa nesse cenário — `IF EXISTS` no bloco DO
    // garante isso. Sem essa proteção, a migration falharia em todo banco
    // novo.
    await withDatabase("seo_pub_no_table", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        const filenames = await getMigrationFilenames(db);
        expect(filenames).toContain("022_seo_publications_is_indexable.sql");

        // Tabela continua não existindo — migration NÃO criou.
        const tableExists = await db.query(
          `
          SELECT COUNT(*)::int AS n
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'seo_publications'
          `
        );
        expect(tableExists.rows[0].n).toBe(0);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("faz boot com RUN_MIGRATIONS=true sem cair em banco vazio", async () => {
    await withDatabase("boot", async ({ dbUrl }) => {
      const server = await startServerAndWait({
        ...buildBaseEnv(dbUrl),
        PORT: "0",
        HOST: "127.0.0.1",
        RUN_MIGRATIONS: "true",
      });

      const db = await openPool(dbUrl);
      try {
        const filenames = await getMigrationFilenames(db);
        expect(filenames).toContain("012_core_schema_compatibility.sql");
        expect(server.output.includes("api online")).toBe(true);
      } finally {
        await db.end();
        await stopServer(server.child);
      }
    });
  }, 120000);
});
