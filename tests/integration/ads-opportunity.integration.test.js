import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
import { buildAdsSearchQuery } from "../../src/modules/ads/filters/ads-filter.builder.js";

/**
 * Integration test do selo "Oportunidade" — cobre os 6 cenários da regra
 * canônica definida pelo produto:
 *
 *   opportunity = below_fipe AND fipe_reference_value > 0
 *                 AND price > 0 AND price <= fipe_reference_value * 0.90
 *
 * Diferente de `below_fipe` (qualquer margem), `opportunity` exige >= 10%.
 * Ver `src/modules/ads/filters/ads-ranking.sql.js` (opportunityExpr).
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
  return `opp_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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
    JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-opp",
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
    child.stdout.on("data", (c) => {
      output += c.toString();
    });
    child.stderr.on("data", (c) => {
      output += c.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Processo ${relativeEntryPath} falhou (${code}).\n${output}`));
    });
  });
}

/**
 * Insere uma única cidade + usuário + advertiser e devolve callbacks
 * para criar ads com (price, fipe_reference_value, below_fipe) variados.
 *
 * Não passa pelo pipeline de risk; popula `fipe_reference_value` direto
 * para isolar o teste da expressão `opportunityExpr`.
 */
async function setupFixtures(db) {
  const { rows: cityRows } = await db.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Test Opp', 'TT', 'test-opp-tt') RETURNING id`
  );
  const cityId = cityRows[0].id;

  const { rows: userRows } = await db.query(
    `INSERT INTO users (email, plan_id, document_type, document_verified)
     VALUES ('opp@test.local', 'cpf-free-essential', 'cpf', true) RETURNING id`
  );
  const userId = userRows[0].id;

  const { rows: advRows } = await db.query(
    `INSERT INTO advertisers (user_id, name) VALUES ($1, 'Vendedor Test') RETURNING id`,
    [userId]
  );
  const advertiserId = advRows[0].id;

  const baseCreatedAt = new Date("2026-04-01T12:00:00Z").toISOString();

  async function makeAd({ title, price, fipeReferenceValue, belowFipe }) {
    const { rows } = await db.query(
      `
      INSERT INTO ads (
        advertiser_id, city_id, title, brand, model, price, year, mileage, plan,
        status, slug, fipe_reference_value, below_fipe, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'Honda', 'Civic', $4, 2020, 50000, 'free',
        'active', $5, $6, $7, $8, $8
      ) RETURNING id
      `,
      [
        advertiserId,
        cityId,
        title,
        price,
        `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${advertiserId}-${Math.random().toString(36).slice(2, 7)}`,
        fipeReferenceValue,
        belowFipe,
        baseCreatedAt,
      ]
    );
    return rows[0].id;
  }

  return { makeAd, cityId };
}

async function fetchOpportunityById(db, adId) {
  const { dataQuery, params } = buildAdsSearchQuery({ city_slug: "test-opp-tt", limit: 50 });
  const result = await db.query(dataQuery, params);
  const row = result.rows.find((r) => r.id === adId);
  if (!row) throw new Error(`Ad ${adId} não encontrado no resultado`);
  return row.opportunity;
}

describe.sequential("integração — selo opportunity (>=10% abaixo da FIPE)", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("price exatamente 10% abaixo (price=90k, fipe=100k) → opportunity=true", async () => {
    await withDatabase("exato-10pct", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic 10pct",
          price: 90000,
          fipeReferenceValue: 100000,
          belowFipe: true,
        });
        expect(await fetchOpportunityById(db, id)).toBe(true);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("price >10% abaixo (price=80k, fipe=100k) → opportunity=true", async () => {
    await withDatabase("mais-10pct", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic 20pct",
          price: 80000,
          fipeReferenceValue: 100000,
          belowFipe: true,
        });
        expect(await fetchOpportunityById(db, id)).toBe(true);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("price 9% abaixo (price=91k, fipe=100k) → opportunity=false", async () => {
    await withDatabase("9pct", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic 9pct",
          price: 91000,
          fipeReferenceValue: 100000,
          belowFipe: true,
        });
        expect(await fetchOpportunityById(db, id)).toBe(false);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("price abaixo sem margem relevante (price=99k, fipe=100k, below_fipe=true) → opportunity=false", async () => {
    await withDatabase("sem-margem", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic 1pct",
          price: 99000,
          fipeReferenceValue: 100000,
          belowFipe: true,
        });
        // Anúncio abaixo da FIPE mas sem margem de "oportunidade".
        expect(await fetchOpportunityById(db, id)).toBe(false);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("sem fipe_reference_value → opportunity=false (não promete margem que não foi calculada)", async () => {
    await withDatabase("sem-fipe", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic NoFipe",
          price: 50000,
          fipeReferenceValue: null,
          belowFipe: true,
        });
        expect(await fetchOpportunityById(db, id)).toBe(false);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("fipe_reference_value = 0 → opportunity=false (defesa contra dado malformado)", async () => {
    await withDatabase("fipe-zero", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic FipeZero",
          price: 50000,
          fipeReferenceValue: 0,
          belowFipe: true,
        });
        expect(await fetchOpportunityById(db, id)).toBe(false);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("price = 0 → opportunity=false (defesa contra dado malformado)", async () => {
    await withDatabase("price-zero", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic PriceZero",
          price: 0,
          fipeReferenceValue: 100000,
          belowFipe: true,
        });
        expect(await fetchOpportunityById(db, id)).toBe(false);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("below_fipe = false mesmo com price <= 90% FIPE → opportunity=false (guard exige flag)", async () => {
    await withDatabase("below-false", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { makeAd } = await setupFixtures(db);
        const id = await makeAd({
          title: "Civic BelowFalse",
          price: 80000,
          fipeReferenceValue: 100000,
          belowFipe: false,
        });
        // below_fipe=false (não passou pelo risk pipeline ou foi marcado errado)
        // — opportunityExpr exige o flag explícito. Defesa contra inconsistência.
        expect(await fetchOpportunityById(db, id)).toBe(false);
      } finally {
        await db.end();
      }
    });
  }, 180000);
});
