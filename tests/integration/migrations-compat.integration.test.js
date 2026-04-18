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
        expect(filenames.length).toBeGreaterThanOrEqual(12);
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
