import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * Guarda de SCHEMA DRIFT da tabela `payments`.
 *
 * Pega, no CI, divergência entre o schema real (pós-migrations) e o que o
 * código de billing INSERE — o bug que passou para produção (payments legada
 * sem `plan_id`/`mercado_pago_id`, causando 500 no webhook).
 *
 *   Caso A: após todas as migrations, o INSERT REAL (mesmas colunas de
 *           upsertPlanPayment/recordPaymentAndActivate) funciona e a
 *           idempotência ON CONFLICT (mercado_pago_id) dedup-a.
 *   Caso B: a migration 042 reconcilia uma `payments` LEGADA (schema pré-020)
 *           para a canônica (renomeia + recria), e o INSERT passa a funcionar.
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
  return `paysch_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`);
}
async function withDatabase(label, callback) {
  const dbName = makeDbName(label);
  await createDatabase(dbName);
  try {
    return await callback({ dbName, dbUrl: makeDatabaseUrl(dbName) });
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
    JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-pay",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET || "integration-refresh-secret-minimum-32-characters-long",
  };
}
async function runNodeScript(relativeEntryPath, extraEnv = {}) {
  const entryPath = path.join(workspaceRoot, relativeEntryPath);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c.toString()));
    child.stderr.on("data", (c) => (output += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${relativeEntryPath} falhou (${code}).\n${output}`))
    );
  });
}

// INSERT idêntico ao do código (upsertPlanPayment / recordPaymentAndActivate).
const PAYMENTS_INSERT = `
  INSERT INTO payments (user_id, plan_id, mercado_pago_id, status, amount, payment_type)
  VALUES ($1, $2, $3, 'approved', $4, 'recurring')
  ON CONFLICT (mercado_pago_id) DO NOTHING
  RETURNING id
`;

describe.sequential("integração — schema da tabela payments (drift guard)", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);
  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("Caso A: INSERT real na payments canônica funciona + idempotência ON CONFLICT", async () => {
    await withDatabase("canon", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        // cnpj-store-start é seedado pela 020 (FK plan_id).
        const first = await db.query(PAYMENTS_INSERT, ["u-test", "cnpj-store-start", "MP-A-1", 79.9]);
        expect(first.rows.length).toBe(1); // pagamento novo

        const dup = await db.query(PAYMENTS_INSERT, ["u-test", "cnpj-store-start", "MP-A-1", 79.9]);
        expect(dup.rows.length).toBe(0); // idempotência: mesmo mercado_pago_id não duplica
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("Caso B: migration 042 reconcilia uma payments LEGADA (pré-020) para a canônica", async () => {
    await withDatabase("legacy", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        // Simula o estado de produção: derruba a canônica e recria a LEGADA.
        await db.query(`DROP TABLE IF EXISTS payments_legacy_pre020`);
        await db.query(`DROP TABLE IF EXISTS payments CASCADE`);
        await db.query(`
          CREATE TABLE payments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            mp_payment_id TEXT,
            mp_preference_id TEXT,
            status TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            currency TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);

        // Roda o SQL da 042 isoladamente contra a tabela legada.
        const sql = await readFile(
          path.join(workspaceRoot, "src/database/migrations/042_payments_schema_reconcile.sql"),
          "utf8"
        );
        await db.query(sql);

        // Legada preservada em arquivo, canônica no lugar.
        const legacy = await db.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = 'payments_legacy_pre020'`
        );
        expect(legacy.rows.length).toBe(1);

        const cols = await db.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'payments' AND column_name = 'mercado_pago_id'`
        );
        expect(cols.rows.length).toBe(1);

        // E o INSERT real do código passa a funcionar.
        const ins = await db.query(PAYMENTS_INSERT, ["u-test", "cnpj-store-start", "MP-B-1", 149.9]);
        expect(ins.rows.length).toBe(1);
      } finally {
        await db.end();
      }
    });
  }, 180000);
});
