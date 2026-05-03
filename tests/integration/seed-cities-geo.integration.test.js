import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
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
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));

function makeDbName(label) {
  return `geoseed_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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
    JWT_SECRET:
      process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-geoseed",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET ||
      "integration-refresh-secret-minimum-32-characters-long",
  };
}

async function runNodeScript(relativeEntryPath, extraEnv = {}, args = []) {
  const entryPath = path.join(workspaceRoot, relativeEntryPath);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath, ...args], {
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

async function writeTempFixture(label, content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `cnc-fixture-${label}-`));
  const filePath = path.join(dir, "source.json");
  await fs.writeFile(filePath, JSON.stringify(content), "utf8");
  return filePath;
}

/**
 * Fixture com 5 entries no formato kelvins/Municipios-Brasileiros:
 * - 3 dessas batem com cities locais (sao-paulo-sp, rio-de-janeiro-rj, atibaia-sp).
 * - 2 são "extras" sem cidade local correspondente (curitiba-pr, salvador-ba).
 *
 * cities locais inseridas no test (5):
 * - 3 acima (vao popular).
 * - 2 sem match na fonte: cidade-fictic-tt, outra-fictic-tt.
 *
 * Resultado esperado:
 *   updated         = 3
 *   unmatched       = 2 (cidade-fictic-tt + outra-fictic-tt)
 *   extras          = 2 (curitiba-pr + salvador-ba na fonte sem match local)
 *   alreadyPopulated= 0 (todas comecam NULL)
 */
function buildSourceFixture() {
  return [
    { codigo_ibge: 3550308, nome: "São Paulo", latitude: -23.5505, longitude: -46.6333, codigo_uf: 35 },
    { codigo_ibge: 3304557, nome: "Rio de Janeiro", latitude: -22.9068, longitude: -43.1729, codigo_uf: 33 },
    { codigo_ibge: 3504503, nome: "Atibaia", latitude: -23.1171, longitude: -46.5503, codigo_uf: 35 },
    // Extras sem cidade local correspondente.
    { codigo_ibge: 4106902, nome: "Curitiba", latitude: -25.4284, longitude: -49.2733, codigo_uf: 41 },
    { codigo_ibge: 2927408, nome: "Salvador", latitude: -12.9714, longitude: -38.5014, codigo_uf: 29 },
  ];
}

async function seedLocalCities(db) {
  await db.query(
    `INSERT INTO cities (name, state, slug) VALUES
     ('São Paulo',      'SP', 'sao-paulo-sp'),
     ('Rio de Janeiro', 'RJ', 'rio-de-janeiro-rj'),
     ('Atibaia',        'SP', 'atibaia-sp'),
     ('Cidade Fictic',  'TT', 'cidade-fictic-tt'),
     ('Outra Fictic',   'TT', 'outra-fictic-tt')`
  );
}

describe.sequential("integração — scripts/seed-cities-geo.mjs", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("popula 3 cidades com match na fonte; deixa 2 sem match NULL; ignora 2 extras", async () => {
    await withDatabase("happy", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        await seedLocalCities(db);
        const fixturePath = await writeTempFixture("happy", buildSourceFixture());

        await runNodeScript("scripts/seed-cities-geo.mjs", {
          ...buildBaseEnv(dbUrl),
          CITIES_GEO_SOURCE_FILE: fixturePath,
        });

        const { rows } = await db.query(
          `SELECT slug, latitude, longitude FROM cities ORDER BY slug ASC`
        );
        const bySlug = Object.fromEntries(
          rows.map((r) => [
            r.slug,
            {
              latitude: r.latitude == null ? null : Number(r.latitude),
              longitude: r.longitude == null ? null : Number(r.longitude),
            },
          ])
        );

        // 3 com match — devem ter lat/long preenchidos.
        expect(bySlug["sao-paulo-sp"]).toEqual({ latitude: -23.5505, longitude: -46.6333 });
        expect(bySlug["rio-de-janeiro-rj"]).toEqual({
          latitude: -22.9068,
          longitude: -43.1729,
        });
        expect(bySlug["atibaia-sp"]).toEqual({ latitude: -23.1171, longitude: -46.5503 });

        // 2 sem match — continuam NULL.
        expect(bySlug["cidade-fictic-tt"]).toEqual({ latitude: null, longitude: null });
        expect(bySlug["outra-fictic-tt"]).toEqual({ latitude: null, longitude: null });

        // Extras na fonte (curitiba-pr, salvador-ba) NUNCA criam cidades novas
        // — o script só faz UPDATE, nunca INSERT. Asserta count total preservado.
        const { rows: countRows } = await db.query(`SELECT COUNT(*)::int AS total FROM cities`);
        expect(countRows[0].total).toBe(5);

        // Confirma que nenhuma cidade extra "vazou" pra cities (curitiba/salvador).
        const { rows: extras } = await db.query(
          `SELECT slug FROM cities WHERE slug IN ('curitiba-pr', 'salvador-ba')`
        );
        expect(extras).toEqual([]);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("rerun é idempotente: cidades ja populadas não são sobrescritas (sem --force)", async () => {
    await withDatabase("idempotent", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        await seedLocalCities(db);
        const fixturePath = await writeTempFixture("idempotent", buildSourceFixture());

        // Primeira run: popula 3 cidades.
        await runNodeScript("scripts/seed-cities-geo.mjs", {
          ...buildBaseEnv(dbUrl),
          CITIES_GEO_SOURCE_FILE: fixturePath,
        });

        // Snapshot do estado depois da primeira run.
        const { rows: firstRun } = await db.query(
          `SELECT slug, latitude, longitude FROM cities ORDER BY slug ASC`
        );

        // Mexer manualmente em uma cidade já populada para detectar overwrite.
        // Se o script for idempotente, esse valor manual NÃO pode ser sobrescrito
        // pela segunda run sem --force.
        await db.query(
          `UPDATE cities SET latitude = -99.9, longitude = -99.9 WHERE slug = 'sao-paulo-sp'`
        );

        // Segunda run sem --force.
        await runNodeScript("scripts/seed-cities-geo.mjs", {
          ...buildBaseEnv(dbUrl),
          CITIES_GEO_SOURCE_FILE: fixturePath,
        });

        const { rows: afterSecond } = await db.query(
          `SELECT slug, latitude, longitude FROM cities WHERE slug = 'sao-paulo-sp'`
        );

        // Cidade ja populada (com nosso valor manual) NÃO foi sobrescrita.
        expect(Number(afterSecond[0].latitude)).toBe(-99.9);
        expect(Number(afterSecond[0].longitude)).toBe(-99.9);

        // Cidades sem lat/long no DB seguem sem lat/long (snapshot estavel).
        const { rows: stillNull } = await db.query(
          `SELECT slug FROM cities WHERE latitude IS NULL OR longitude IS NULL ORDER BY slug ASC`
        );
        expect(stillNull.map((r) => r.slug)).toEqual(["cidade-fictic-tt", "outra-fictic-tt"]);

        // Suprime warning do firstRun não sendo usado em todas as branches.
        expect(firstRun.length).toBe(5);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("--force sobrescreve cidades ja populadas", async () => {
    await withDatabase("force", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        await seedLocalCities(db);
        const fixturePath = await writeTempFixture("force", buildSourceFixture());

        // Pre-popula sao-paulo-sp com valores incorretos para demonstrar
        // que --force sobrescreve.
        await db.query(
          `UPDATE cities SET latitude = -1.111, longitude = -2.222 WHERE slug = 'sao-paulo-sp'`
        );

        await runNodeScript(
          "scripts/seed-cities-geo.mjs",
          { ...buildBaseEnv(dbUrl), CITIES_GEO_SOURCE_FILE: fixturePath },
          ["--force"]
        );

        const { rows } = await db.query(
          `SELECT latitude, longitude FROM cities WHERE slug = 'sao-paulo-sp'`
        );
        expect(Number(rows[0].latitude)).toBe(-23.5505);
        expect(Number(rows[0].longitude)).toBe(-46.6333);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("após popular, regions:build constroi memberships para as 3 cidades populadas", async () => {
    await withDatabase("e2e-regions", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        await seedLocalCities(db);
        const fixturePath = await writeTempFixture("e2e", buildSourceFixture());

        await runNodeScript("scripts/seed-cities-geo.mjs", {
          ...buildBaseEnv(dbUrl),
          CITIES_GEO_SOURCE_FILE: fixturePath,
        });

        await runNodeScript("scripts/build-region-memberships.mjs", buildBaseEnv(dbUrl));

        // sao-paulo-sp e atibaia-sp estão em SP, dentro de ~50km — devem virar
        // membros mútuos em layer 2 (30 < dist <= 60).
        const { rows: spMembers } = await db.query(
          `
          SELECT c.slug, rm.layer
          FROM region_memberships rm
          JOIN cities c1 ON c1.id = rm.base_city_id
          JOIN cities c ON c.id = rm.member_city_id
          WHERE c1.slug = 'sao-paulo-sp' AND rm.member_city_id != rm.base_city_id
          `
        );
        const spSlugs = spMembers.map((r) => r.slug);
        expect(spSlugs).toContain("atibaia-sp");

        // rio-de-janeiro-rj está em RJ — não pode ter atibaia/sp como member
        // (regra "nunca cruza UF").
        const { rows: rjMembers } = await db.query(
          `
          SELECT c.slug
          FROM region_memberships rm
          JOIN cities c1 ON c1.id = rm.base_city_id
          JOIN cities c ON c.id = rm.member_city_id
          WHERE c1.slug = 'rio-de-janeiro-rj' AND rm.member_city_id != rm.base_city_id
          `
        );
        expect(rjMembers.map((r) => r.slug)).not.toContain("atibaia-sp");
        expect(rjMembers.map((r) => r.slug)).not.toContain("sao-paulo-sp");

        // cidades sem geo continuam só com self-row (layer 0).
        const { rows: ficticMembers } = await db.query(
          `
          SELECT rm.layer
          FROM region_memberships rm
          JOIN cities c ON c.id = rm.base_city_id
          WHERE c.slug = 'cidade-fictic-tt'
          `
        );
        expect(ficticMembers.length).toBe(1);
        expect(ficticMembers[0].layer).toBe(0);
      } finally {
        await db.end();
      }
    });
  }, 240000);
});
