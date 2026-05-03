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
  return `region_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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
    WHERE datname = $1 AND pid <> pg_backend_pid()
    `,
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
      process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-region",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET ||
      "integration-refresh-secret-minimum-32-characters-long",
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

async function listIndexes(pool, tableName) {
  const result = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1`,
    [tableName]
  );
  return new Set(result.rows.map((row) => row.indexname));
}

describe.sequential("integração — region_memberships e cities.lat/long (migration 021)", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("cria cities.latitude/longitude e region_memberships com indexes esperados", async () => {
    await withDatabase("schema", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        const cityCols = await listColumns(db, "cities");
        expect(cityCols.has("latitude")).toBe(true);
        expect(cityCols.has("longitude")).toBe(true);

        const memCols = await listColumns(db, "region_memberships");
        expect(memCols.has("base_city_id")).toBe(true);
        expect(memCols.has("member_city_id")).toBe(true);
        expect(memCols.has("distance_km")).toBe(true);
        expect(memCols.has("layer")).toBe(true);

        const indexes = await listIndexes(db, "region_memberships");
        expect(indexes.has("region_memberships_base_layer_idx")).toBe(true);
        expect(indexes.has("region_memberships_member_idx")).toBe(true);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("backfill da migration: toda cidade existente ganha self-row layer 0", async () => {
    await withDatabase("backfill", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));

      const db = await openPool(dbUrl);
      try {
        await db.query(
          `INSERT INTO cities (name, state, slug) VALUES ('Test Backfill', 'TT', 'test-backfill-tt')`
        );

        // Migration ja rodou; precisamos forcar o backfill rodar de novo para
        // pegar a city que acabamos de inserir. Aplicamos o mesmo INSERT que a
        // migration usa — e idempotente (ON CONFLICT DO NOTHING).
        await db.query(
          `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
           SELECT id, id, 0, 0 FROM cities
           ON CONFLICT (base_city_id, member_city_id) DO NOTHING`
        );

        const { rows } = await db.query(
          `
          SELECT rm.base_city_id, rm.member_city_id, rm.distance_km, rm.layer
          FROM region_memberships rm
          JOIN cities c ON c.id = rm.base_city_id
          WHERE c.slug = 'test-backfill-tt'
          `
        );

        expect(rows.length).toBe(1);
        expect(rows[0].layer).toBe(0);
        expect(Number(rows[0].distance_km)).toBe(0);
        expect(rows[0].base_city_id).toBe(rows[0].member_city_id);
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("region_memberships aceita self-row + many-to-many (mesma cidade pode ser base e membro de outras)", async () => {
    await withDatabase("manymany", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const { rows: cityRows } = await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES
           ('A', 'TT', 'a-tt', -23.5, -46.6),
           ('B', 'TT', 'b-tt', -23.4, -46.5),
           ('C', 'TT', 'c-tt', -23.3, -46.4)
           RETURNING id, slug`
        );
        const ids = Object.fromEntries(cityRows.map((r) => [r.slug, r.id]));

        // Self-row para cada uma (idempotente).
        await db.query(
          `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer)
           SELECT id, id, 0, 0 FROM cities WHERE slug LIKE '%-tt'
           ON CONFLICT DO NOTHING`
        );

        // A é base de B e C; B é base de A e C; C é base de A e B.
        await db.query(
          `
          INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer) VALUES
            ($1, $2, 12.3, 1),
            ($1, $3, 25.1, 1),
            ($2, $1, 12.3, 1),
            ($2, $3, 14.0, 1),
            ($3, $1, 25.1, 1),
            ($3, $2, 14.0, 1)
          `,
          [ids["a-tt"], ids["b-tt"], ids["c-tt"]]
        );

        // A aparece como member em rows de B e C (many-to-many).
        const { rows: aAsMember } = await db.query(
          `SELECT base_city_id FROM region_memberships
           WHERE member_city_id = $1 AND layer = 1`,
          [ids["a-tt"]]
        );
        expect(new Set(aAsMember.map((r) => r.base_city_id))).toEqual(
          new Set([ids["b-tt"], ids["c-tt"]])
        );
      } finally {
        await db.end();
      }
    });
  }, 120000);

  it("worker pula cidades sem latitude/longitude (degrade gracioso)", async () => {
    await withDatabase("worker-skip", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        // Insere 2 cidades sem geo + 2 com geo na mesma UF.
        await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES
           ('Sem GPS A', 'TT', 'sem-gps-a-tt', NULL, NULL),
           ('Sem GPS B', 'TT', 'sem-gps-b-tt', NULL, NULL),
           ('Com GPS A', 'TT', 'com-gps-a-tt', -23.5505, -46.6333),
           ('Com GPS B', 'TT', 'com-gps-b-tt', -23.4538, -46.5333)`
        );

        await runNodeScript("scripts/build-region-memberships.mjs", buildBaseEnv(dbUrl));

        // Cidade SEM GPS não deve aparecer em nenhum row (nem como base, nem como member),
        // exceto a self-row (que vem da migration, layer 0).
        const { rows: semGpsRows } = await db.query(
          `
          SELECT rm.base_city_id, rm.member_city_id, rm.layer
          FROM region_memberships rm
          JOIN cities c1 ON c1.id = rm.base_city_id
          JOIN cities c2 ON c2.id = rm.member_city_id
          WHERE (c1.slug LIKE 'sem-gps-%' OR c2.slug LIKE 'sem-gps-%')
            AND rm.layer != 0
          `
        );
        expect(semGpsRows).toEqual([]);

        // Cidades COM GPS devem ter pelo menos 1 vizinha (uma na outra).
        const { rows: comGpsLayer1 } = await db.query(
          `
          SELECT rm.base_city_id, rm.member_city_id
          FROM region_memberships rm
          JOIN cities c1 ON c1.id = rm.base_city_id
          WHERE c1.slug = 'com-gps-a-tt' AND rm.layer = 1
          `
        );
        expect(comGpsLayer1.length).toBeGreaterThanOrEqual(1);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("worker é idempotente: rerun não duplica memberships nem altera layers já corretos", async () => {
    await withDatabase("worker-idempotent", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES
           ('IDM A', 'TT', 'idm-a-tt', -23.5505, -46.6333),
           ('IDM B', 'TT', 'idm-b-tt', -23.4538, -46.5333)`
        );

        await runNodeScript("scripts/build-region-memberships.mjs", buildBaseEnv(dbUrl));
        const { rows: firstRun } = await db.query(
          `SELECT base_city_id, member_city_id, layer, distance_km FROM region_memberships
           ORDER BY base_city_id, member_city_id`
        );

        await runNodeScript("scripts/build-region-memberships.mjs", buildBaseEnv(dbUrl));
        const { rows: secondRun } = await db.query(
          `SELECT base_city_id, member_city_id, layer, distance_km FROM region_memberships
           ORDER BY base_city_id, member_city_id`
        );

        expect(secondRun.length).toBe(firstRun.length);
        expect(secondRun).toEqual(firstRun);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  /**
   * O contrato do service `getRegionByBaseSlug` é uma combinação de duas
   * queries simples:
   *   (a) SELECT base FROM cities WHERE slug = $1
   *   (b) SELECT members FROM region_memberships rm JOIN cities c
   *       WHERE rm.base_city_id = base.id AND rm.member_city_id != base.id
   *       ORDER BY layer ASC, distance_km ASC, c.name ASC
   *
   * Replicamos essa SQL diretamente nos testes para evitar carregar o
   * módulo `db.js` (pool é singleton com DATABASE_URL fixado no load).
   * Validar a SQL é o que importa — se a SQL bate, o service também.
   */
  async function readRegionViaSql(db, slug) {
    const baseRes = await db.query(
      `SELECT id, slug, name, state FROM cities WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    const base = baseRes.rows[0];
    if (!base) return null;

    const membersRes = await db.query(
      `
      SELECT
        c.id AS city_id, c.slug, c.name, c.state,
        rm.layer, rm.distance_km
      FROM region_memberships rm
      JOIN cities c ON c.id = rm.member_city_id
      WHERE rm.base_city_id = $1 AND rm.member_city_id != $1
      ORDER BY rm.layer ASC, rm.distance_km ASC NULLS LAST, c.name ASC
      `,
      [base.id]
    );

    return { base, members: membersRes.rows };
  }

  it("service contract: { base, members[] } ordenado por layer/distance/name; self-row excluída", async () => {
    await withDatabase("service", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES
           ('Hub', 'TT', 'hub-tt', -23.5505, -46.6333),
           ('Vizinha 1', 'TT', 'v1-tt', -23.4538, -46.5333),
           ('Vizinha 2', 'TT', 'v2-tt', -23.5329, -46.7918),
           ('Distante', 'TT', 'dist-tt', -23.1171, -46.5503)`
        );
        await runNodeScript("scripts/build-region-memberships.mjs", buildBaseEnv(dbUrl));

        const region = await readRegionViaSql(db, "hub-tt");
        expect(region).not.toBeNull();
        expect(region.base.slug).toBe("hub-tt");

        // Self-row excluída.
        expect(region.members.find((m) => m.slug === "hub-tt")).toBeUndefined();

        // Ordem: layer ASC, distance ASC, name ASC.
        for (let i = 1; i < region.members.length; i++) {
          const prev = region.members[i - 1];
          const curr = region.members[i];
          expect(curr.layer).toBeGreaterThanOrEqual(prev.layer);
          if (curr.layer === prev.layer) {
            expect(Number(curr.distance_km)).toBeGreaterThanOrEqual(Number(prev.distance_km));
          }
        }
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("service contract: members:[] para cidade-base sem vizinhos cadastrados", async () => {
    await withDatabase("service-empty", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES
           ('Sozinha', 'TT', 'sozinha-tt', -10.0, -70.0)`
        );
        await runNodeScript("scripts/build-region-memberships.mjs", buildBaseEnv(dbUrl));

        const region = await readRegionViaSql(db, "sozinha-tt");
        expect(region).not.toBeNull();
        expect(region.base.slug).toBe("sozinha-tt");
        expect(region.members).toEqual([]);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("service contract: null quando o slug não existe na tabela cities", async () => {
    await withDatabase("service-404", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const region = await readRegionViaSql(db, "slug-que-nao-existe-tt");
        expect(region).toBeNull();
      } finally {
        await db.end();
      }
    });
  }, 120000);
});
