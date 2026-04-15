import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";

dotenv.config({ override: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  const url = new URL(connectionString);
  const sslMode = String(url.searchParams.get("sslmode") || "").toLowerCase();
  const explicitSsl =
    sslMode === "require" ||
    sslMode === "prefer" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full" ||
    String(process.env.PG_SSL_ENABLED || "").trim().toLowerCase() === "true";

  if (explicitSsl) {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
  return { connectionString };
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
    DISABLE_REDIS: "true",
    JWT_SECRET:
      process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-compat",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET || "integration-refresh-secret-minimum-32-characters-long",
  };
}

async function runNodeScript(relativeEntryPath, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workspaceRoot, relativeEntryPath)], {
      cwd: workspaceRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve(output);
      reject(new Error(`Processo ${relativeEntryPath} falhou (${code}).\n${output}`));
    });
  });
}

async function startServerAndWait(extraEnv = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workspaceRoot, "src/index.js")], {
      cwd: workspaceRoot,
      env: { ...process.env, ...extraEnv },
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
    const timeout = setTimeout(() => { child.kill("SIGKILL"); }, 10000);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
    child.kill("SIGTERM");
  });
}

async function listColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = $1
     ORDER BY ordinal_position ASC`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function getMigrationFilenames(pool) {
  const result = await pool.query(
    `SELECT filename FROM schema_migrations WHERE filename IS NOT NULL ORDER BY filename ASC`
  );
  return result.rows.map((row) => row.filename);
}

describe.sequential("integração — migrations consolidadas", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("aplica 001_baseline.sql em banco novo com schema completo", async () => {
    await withDatabase("fresh", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        const trackingCols = await listColumns(db, "schema_migrations");
        expect(trackingCols.has("filename")).toBe(true);
        expect(trackingCols.has("checksum")).toBe(true);
        expect(trackingCols.has("executed_at")).toBe(true);

        const userCols = await listColumns(db, "users");
        expect(userCols.has("email")).toBe(true);
        expect(userCols.has("password_hash")).toBe(true);
        expect(userCols.has("reset_token")).toBe(true);
        expect(userCols.has("email_verification_token")).toBe(true);
        expect(userCols.has("failed_attempts")).toBe(true);
        expect(userCols.has("address")).toBe(true);

        const adCols = await listColumns(db, "ads");
        expect(adCols.has("images")).toBe(true);
        expect(adCols.has("slug")).toBe(true);
        expect(adCols.has("below_fipe")).toBe(true);
        expect(adCols.has("blocked_reason")).toBe(true);

        const advCols = await listColumns(db, "advertisers");
        expect(advCols.has("user_id")).toBe(true);
        expect(advCols.has("slug")).toBe(true);
        expect(advCols.has("address")).toBe(true);

        const refreshCols = await listColumns(db, "refresh_tokens");
        expect(refreshCols.has("token_hash")).toBe(true);
        expect(refreshCols.has("revoked")).toBe(true);

        const filenames = await getMigrationFilenames(db);
        expect(filenames).toContain("001_baseline.sql");
        expect(filenames).toHaveLength(1);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("é idempotente — reexecutar não causa erro", async () => {
    await withDatabase("idempotent", async ({ dbUrl }) => {
      const env = buildBaseEnv(dbUrl);
      await runNodeScript("scripts/run-migrations.mjs", env);
      await runNodeScript("scripts/run-migrations.mjs", env);

      const db = await openPool(dbUrl);
      try {
        const filenames = await getMigrationFilenames(db);
        expect(filenames).toHaveLength(1);
        expect(filenames[0]).toBe("001_baseline.sql");
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("faz boot com RUN_MIGRATIONS=true em banco vazio", async () => {
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
        expect(filenames).toContain("001_baseline.sql");
        expect(server.output.includes("api online")).toBe(true);
      } finally {
        await db.end();
        await stopServer(server.child);
      }
    });
  }, 120000);
});
