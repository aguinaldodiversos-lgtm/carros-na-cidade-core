// tests/search-policy/c1-search-vector-canonical.integration.test.js
//
// F2.2-C1 — migration 070 contra Postgres REAL (bancos descartáveis).
// Fecha os blockers D1, D2, D5 e neutraliza D3 da auditoria F2.2-C0.
//
// O que cada bloco prova:
//   1. estado canônico  um único trigger versionado -> ads_search_vector_update();
//                       as duas funções continuam existindo; GIN presente.
//   2. pesos            A = commercial_model + title, B = brand + model,
//                       C = city, D = description — cada slot provado
//                       individualmente (lexema -> peso e @@ com peso fixo).
//   3. pertinência      `city` participa do @@, no SQL e no caminho REAL do
//                       Search Policy Engine (q = nome da cidade).
//   4. updates          sem a lista OF, UPDATE de city / commercial_model /
//                       description recalcula o vetor.
//   5. backfill real    linha criada ANTES da 070 (semântica antiga) migra na
//                       própria linha, sem depender de INSERT posterior.
//   6. GIN              ausente em 069, presente em 070, amname = gin.
//   7. PROD-LIKE        banco com os dois triggers extras de produção:
//                       search_vector IDÊNTICO antes e depois da 070.
//   8. prova p/ C2      com os dois extras removidos em transação revertida,
//                       o vetor é o mesmo que com os três triggers.
//   9. rollback app     o INSERT do ads.repository (que grava search_vector
//                       explicitamente) continua funcionando num banco 070.
//  10. idempotência     aplicar a 070 duas vezes não duplica nada nem muda o vetor.
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../integration/helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
import {
  applyMemberships,
  buildAllMemberships,
  loadCities,
} from "../../src/modules/regions/region-memberships.builder.js";
import { runSearchPolicyEngine } from "../../src/modules/ads/search-policy/engine.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

dotenv.config({ override: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const MIGRATION_070 = "070_ads_search_vector_canonical.sql";
const MIGRATION_070_PATH = path.join(workspaceRoot, "src/database/migrations", MIGRATION_070);

const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;
const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";
const adminPool = new Pool({
  connectionString: adminUrl.toString(),
  ssl: resolveSslConfig(adminUrl.toString(), process.env),
});

async function withDatabase(label, fn) {
  const dbName = `sp_c1_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  const u = new URL(baseDatabaseUrl);
  u.pathname = `/${dbName}`;
  const dbUrl = u.toString();
  const db = new Pool({ connectionString: dbUrl, ssl: resolveSslConfig(dbUrl, process.env) });
  try {
    return await fn({ dbUrl, db, env: envFor(dbUrl) });
  } finally {
    await db.end().catch(() => {});
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  }
}

function envFor(dbUrl) {
  return {
    ...process.env,
    DATABASE_URL: dbUrl,
    TEST_DATABASE_URL: dbUrl,
    NODE_ENV: "test",
    RUN_WORKERS: "false",
    DISABLE_REDIS: "true",
    LOG_LEVEL: "warn",
    JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-c1",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET || "integration-refresh-secret-minimum-32-characters-long",
  };
}

function runScript(relPath, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workspaceRoot, relPath), ...args], {
      cwd: workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${relPath} saiu com ${code}\n${out}`))
    );
  });
}

/**
 * Roda o runner OFICIAL, mas para em 069: pré-registra a 070 em
 * `schema_migrations` (mesmo formato canônico que o runner cria), e o runner a
 * trata como "já aplicada". Nenhum SQL da 070 é executado.
 */
async function migrateUpTo069(db, env) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`INSERT INTO schema_migrations (id, filename) VALUES ($1, $2)`, [
    MIGRATION_070.replace(/\.sql$/, ""),
    MIGRATION_070,
  ]);
  await runScript("scripts/run-migrations.mjs", env);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM schema_migrations WHERE filename < $1`,
    [MIGRATION_070]
  );
  expect(rows[0].n).toBe(69);
}

/** Aplica o SQL literal da 070 (o mesmo arquivo que o runner aplicaria). */
async function applyMigration070(db) {
  const sql = await fs.readFile(MIGRATION_070_PATH, "utf8");
  // Mesma envoltória que src/database/migrate.js usa: um arquivo, uma transação,
  // na MESMA conexão (Pool.query não garante isso).
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return sql;
}

/** Os dois triggers que só existem em produção (auditoria C0 §D). */
async function createProdOnlyTriggers(db) {
  await db.query(`
    CREATE TRIGGER trg_ads_search_vector_update
      BEFORE INSERT OR UPDATE ON ads
      FOR EACH ROW EXECUTE FUNCTION ads_search_vector_update();
  `);
  await db.query(`
    CREATE TRIGGER trigger_ads_search_vector
      BEFORE INSERT OR UPDATE ON ads
      FOR EACH ROW EXECUTE FUNCTION ads_search_vector_update();
  `);
}

async function adsTriggers(db) {
  const { rows } = await db.query(
    `SELECT t.tgname, p.proname, pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE c.relname = 'ads' AND NOT t.tgisinternal
      ORDER BY t.tgname COLLATE "C"`
  );
  return rows;
}

/** Mapa lexema -> letra de peso, direto do tsvector da linha. */
async function weightMap(db, adId) {
  const { rows } = await db.query(
    `SELECT x.lexeme, array_to_string(x.weights, '') AS w
       FROM ads a, unnest(a.search_vector) AS x
      WHERE a.id = $1
      ORDER BY x.lexeme`,
    [adId]
  );
  return Object.fromEntries(rows.map((r) => [r.lexeme, r.w]));
}

/** @@ com peso FIXO: só casa se o lexema estiver naquele peso. */
async function matchesAtWeight(db, adId, term, weight) {
  const { rows } = await db.query(
    `SELECT (search_vector @@ to_tsquery('portuguese', $2)) AS ok FROM ads WHERE id = $1`,
    [adId, `${term}:${weight}`]
  );
  return rows[0].ok === true;
}

async function matchesPlain(db, adId, term) {
  const { rows } = await db.query(
    `SELECT (search_vector @@ plainto_tsquery('portuguese', $2)) AS ok FROM ads WHERE id = $1`,
    [adId, term]
  );
  return rows[0].ok === true;
}

/** Cidade mínima + anúncio sonda com um lexema exclusivo por campo. */
async function seedProbeCity(db, { cityName, slug, lat, lng }) {
  const { rows } = await db.query(
    `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES ($1,'SP',$2,$3,$4) RETURNING id`,
    [cityName, slug, lat, lng]
  );
  return Number(rows[0].id);
}

async function insertProbeAd(db, { cityId, cityName, slug, overrides = {} }) {
  const a = {
    title: "Zetatitle",
    brand: "Alfabrand",
    model: "Betamodel",
    commercial_model: "Gamacomm",
    description: "Epsilondesc",
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO ads (city_id, city, state, title, brand, model, commercial_model, description,
                      price, year, mileage, status, plan, slug, images)
     VALUES ($1,$2,'SP',$3,$4,$5,$6,$7, 50000, 2022, 30000, 'active', 'free', $8, '[]'::jsonb)
     RETURNING id`,
    [cityId, cityName, a.title, a.brand, a.model, a.commercial_model, a.description, slug]
  );
  return Number(rows[0].id);
}

afterAll(async () => {
  await adminPool.end();
});

describe.sequential("F2.2-C1 — migration 070: search_vector canônico (Postgres real)", () => {
  // ── 1 + 2 + 3 + 4 + 6 (banco fresh completo, 001..070) ─────────────────────
  it("estado canônico, pesos A/B/C/D, pertinência por city e updates sem lista OF", async () => {
    await withDatabase("fresh", async ({ db, env }) => {
      await runScript("scripts/run-migrations.mjs", env);

      // ── 1. trigger único e versionado ──
      const trgs = await adsTriggers(db);
      expect(trgs.map((t) => t.tgname)).toEqual(["ads_search_vector_trigger"]);
      expect(trgs[0].proname).toBe("ads_search_vector_update");
      expect(trgs[0].def).toMatch(/BEFORE INSERT OR UPDATE ON public\.ads/);
      expect(trgs[0].def).not.toMatch(/UPDATE OF/);

      // as duas funções continuam existindo (refresh = rollback estrutural)
      const { rows: fns } = await db.query(
        `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname ILIKE '%search_vector%' ORDER BY proname`
      );
      expect(fns.map((f) => f.proname)).toEqual([
        "ads_search_vector_refresh",
        "ads_search_vector_update",
      ]);

      // ── 6. GIN estrutural ──
      const { rows: gin } = await db.query(
        `SELECT i.relname AS index_name, am.amname, pg_get_indexdef(i.oid) AS def
           FROM pg_class t
           JOIN pg_index ix ON ix.indrelid = t.oid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_am am ON am.oid = i.relam
          WHERE t.relname = 'ads' AND i.relname = 'idx_ads_search_vector'`
      );
      expect(gin.length).toBe(1);
      expect(gin[0].amname).toBe("gin");
      expect(gin[0].def).toMatch(/USING gin \(search_vector\)/);

      // ── 2. pesos, um slot por vez ──
      const cityId = await seedProbeCity(db, {
        cityName: "Deltacity",
        slug: `deltacity-${runTag}`,
        lat: -23.1171,
        lng: -46.5563,
      });
      const adId = await insertProbeAd(db, {
        cityId,
        cityName: "Deltacity",
        slug: `probe-${runTag}`,
      });

      // "Zetatitle" é radicalizado pelo dicionário 'portuguese' em 'zetatitl'.
      expect(await weightMap(db, adId)).toEqual({
        gamacomm: "A", // commercial_model
        zetatitl: "A", // title
        alfabrand: "B", // brand
        betamodel: "B", // model
        deltacity: "C", // city
        epsilondesc: "D", // description
      });

      expect(await matchesAtWeight(db, adId, "Gamacomm", "A")).toBe(true);
      expect(await matchesAtWeight(db, adId, "Zetatitle", "A")).toBe(true);
      expect(await matchesAtWeight(db, adId, "Alfabrand", "B")).toBe(true);
      expect(await matchesAtWeight(db, adId, "Betamodel", "B")).toBe(true);
      expect(await matchesAtWeight(db, adId, "Deltacity", "C")).toBe(true);
      expect(await matchesAtWeight(db, adId, "Epsilondesc", "D")).toBe(true);

      // e NÃO casam no peso errado (mutação: se title voltar a D, a 1ª falha)
      expect(await matchesAtWeight(db, adId, "Zetatitle", "D")).toBe(false);
      expect(await matchesAtWeight(db, adId, "Alfabrand", "D")).toBe(false);
      expect(await matchesAtWeight(db, adId, "Deltacity", "D")).toBe(false);

      // title e description deixam de empatar em ts_rank (empatavam no fresh antigo)
      const { rows: ranks } = await db.query(
        `SELECT ts_rank(search_vector, plainto_tsquery('portuguese','Zetatitle'))::float AS t,
                ts_rank(search_vector, plainto_tsquery('portuguese','Epsilondesc'))::float AS d
           FROM ads WHERE id = $1`,
        [adId]
      );
      expect(ranks[0].t).toBeGreaterThan(ranks[0].d);

      // ── 3. pertinência por city (SQL) ──
      expect(await matchesPlain(db, adId, "Deltacity")).toBe(true);

      // ── 4. UPDATE sem lista OF ──
      await db.query(`UPDATE ads SET city = 'Omegacity' WHERE id = $1`, [adId]);
      expect(await matchesPlain(db, adId, "Omegacity")).toBe(true);
      expect(await matchesPlain(db, adId, "Deltacity")).toBe(false);
      expect(await matchesAtWeight(db, adId, "Omegacity", "C")).toBe(true);

      await db.query(`UPDATE ads SET commercial_model = 'Sigmacomm' WHERE id = $1`, [adId]);
      expect(await matchesAtWeight(db, adId, "Sigmacomm", "A")).toBe(true);
      expect(await matchesPlain(db, adId, "Gamacomm")).toBe(false);

      await db.query(`UPDATE ads SET description = 'Kappadesc' WHERE id = $1`, [adId]);
      expect(await matchesAtWeight(db, adId, "Kappadesc", "D")).toBe(true);
      expect(await matchesPlain(db, adId, "Epsilondesc")).toBe(false);
    });
  }, 300000);

  // ── 3 (caminho real do motor) ──────────────────────────────────────────────
  it("q = nome da cidade encontra o anúncio pelo Search Policy Engine (D2)", async () => {
    await withDatabase("engine", async ({ db, env }) => {
      await runScript("scripts/run-migrations.mjs", env);

      const omegaId = await seedProbeCity(db, {
        cityName: "Omegacity",
        slug: "omegacity-sp",
        lat: -23.1171,
        lng: -46.5563,
      });
      await seedProbeCity(db, {
        cityName: "Vizinhacity",
        slug: "vizinhacity-sp",
        lat: -22.9527,
        lng: -46.5419,
      });
      const cities = await loadCities(db);
      const { rows: rmRows } = buildAllMemberships(cities);
      await applyMemberships(db, rmRows, { backupTable: "rm_backup_c1" });

      // Nenhum campo textual do anúncio contém "omegacity" além de `city`.
      const adId = await insertProbeAd(db, {
        cityId: omegaId,
        cityName: "Omegacity",
        slug: `engine-probe-${runTag}`,
      });
      expect(await matchesPlain(db, adId, "Omegacity")).toBe(true);

      resetDictionariesForTests();
      __policyCacheTesting.reset();
      const r = await runSearchPolicyEngine(
        { city_slug: "omegacity-sp", q: "omegacity", limit: "50" },
        { db, policy: SEARCH_POLICY_DEFAULT, cache: false, telemetry: false }
      );
      // o serializador público devolve id como string
      expect(r.data.map((a) => String(a.id))).toContain(String(adId));
      expect(r.pagination.total).toBeGreaterThanOrEqual(1);

      // Controle negativo: termo que não existe em campo algum não casa.
      const none = await runSearchPolicyEngine(
        { city_slug: "omegacity-sp", q: "naoexistelexema", limit: "50" },
        { db, policy: SEARCH_POLICY_DEFAULT, cache: false, telemetry: false }
      );
      // não vacuoso: o motor devolve zero, e não "tudo" por ignorar o q
      expect(none.pagination.total).toBe(0);
      expect(none.data.map((a) => String(a.id))).not.toContain(String(adId));
    });
  }, 300000);

  // ── 5 + 6 (backfill real na MESMA linha) ───────────────────────────────────
  it("backfill: linha criada em 069 migra na própria linha; GIN ausente em 069", async () => {
    await withDatabase("backfill", async ({ db, env }) => {
      await migrateUpTo069(db, env);

      // estado pré-070: trigger da 064 + nenhum GIN sobre search_vector
      const pre = await adsTriggers(db);
      expect(pre.map((t) => t.tgname)).toEqual(["ads_search_vector_trigger"]);
      expect(pre[0].proname).toBe("ads_search_vector_refresh");
      expect(pre[0].def).toMatch(/UPDATE OF brand, model, title, description, commercial_model/);
      const { rows: noGin } = await db.query(
        `SELECT COUNT(*)::int AS n FROM pg_indexes WHERE tablename = 'ads' AND indexname = 'idx_ads_search_vector'`
      );
      expect(noGin[0].n).toBe(0);

      const cityId = await seedProbeCity(db, {
        cityName: "Deltacity",
        slug: `deltacity-bf-${runTag}`,
        lat: -23.1171,
        lng: -46.5563,
      });
      const adId = await insertProbeAd(db, {
        cityId,
        cityName: "Deltacity",
        slug: `probe-bf-${runTag}`,
      });

      // ANTES: city ausente; title e description empatados em D.
      expect(await weightMap(db, adId)).toEqual({
        gamacomm: "A",
        zetatitl: "D",
        alfabrand: "D",
        betamodel: "D",
        epsilondesc: "D",
      });
      expect(await matchesPlain(db, adId, "Deltacity")).toBe(false);

      await applyMigration070(db);

      // DEPOIS, na MESMA linha (nenhum INSERT novo):
      expect(await weightMap(db, adId)).toEqual({
        gamacomm: "A",
        zetatitl: "A",
        alfabrand: "B",
        betamodel: "B",
        deltacity: "C",
        epsilondesc: "D",
      });
      expect(await matchesPlain(db, adId, "Deltacity")).toBe(true);

      const { rows: gin } = await db.query(
        `SELECT am.amname, pg_get_indexdef(i.oid) AS def
           FROM pg_class t
           JOIN pg_index ix ON ix.indrelid = t.oid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_am am ON am.oid = i.relam
          WHERE t.relname = 'ads' AND i.relname = 'idx_ads_search_vector'`
      );
      expect(gin.length).toBe(1);
      expect(gin[0].amname).toBe("gin");
      expect(gin[0].def).toMatch(/USING gin \(search_vector\)/);
    });
  }, 300000);

  // ── 7 + 8 + 10 (PROD-LIKE) ─────────────────────────────────────────────────
  it("PROD-LIKE: vetor idêntico antes/depois da 070; sem os extras o vetor não muda; idempotente", async () => {
    await withDatabase("prodlike", async ({ db, env }) => {
      await migrateUpTo069(db, env);
      await createProdOnlyTriggers(db);

      const before3 = await adsTriggers(db);
      expect(before3.map((t) => t.tgname)).toEqual([
        "ads_search_vector_trigger",
        "trg_ads_search_vector_update",
        "trigger_ads_search_vector",
      ]);
      // quem vence é o último em ordem alfabética
      expect(before3[2].proname).toBe("ads_search_vector_update");

      const cityId = await seedProbeCity(db, {
        cityName: "Deltacity",
        slug: `deltacity-pl-${runTag}`,
        lat: -23.1171,
        lng: -46.5563,
      });
      const ids = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push(
          await insertProbeAd(db, {
            cityId,
            cityName: "Deltacity",
            slug: `pl-${i}-${runTag}`,
            overrides: {
              title: `Zetatitle ${i}`,
              description: `Epsilondesc ${i}`,
              commercial_model: `Gamacomm${i}`,
            },
          })
        );
      }
      // já estão na semântica de produção (city entra em C)
      expect(await matchesAtWeight(db, ids[0], "Deltacity", "C")).toBe(true);

      await db.query(`CREATE TABLE c1_before AS SELECT id, search_vector FROM ads`);

      await applyMigration070(db);

      const { rows: diff } = await db.query(
        `SELECT COUNT(*)::int AS n
           FROM ads a JOIN c1_before b ON b.id = a.id
          WHERE a.search_vector IS DISTINCT FROM b.search_vector`
      );
      expect(diff[0].n).toBe(0);

      const { rows: covered } = await db.query(`SELECT COUNT(*)::int AS n FROM c1_before`);
      expect(covered[0].n).toBe(5);

      // os três triggers agora escrevem a MESMA função
      const after3 = await adsTriggers(db);
      expect(after3.map((t) => t.proname)).toEqual([
        "ads_search_vector_update",
        "ads_search_vector_update",
        "ads_search_vector_update",
      ]);

      // ── 8. prova para a futura C2: sem os dois extras, mesmo vetor ──
      const withThree = await insertProbeAd(db, {
        cityId,
        cityName: "Deltacity",
        slug: `c2-three-${runTag}`,
        overrides: { title: "Zetatitle C2", description: "Epsilondesc C2" },
      });
      const { rows: vThree } = await db.query(
        `SELECT search_vector::text AS sv FROM ads WHERE id = $1`,
        [withThree]
      );

      const client = await db.connect();
      let vOne;
      try {
        await client.query("BEGIN");
        await client.query(`DROP TRIGGER trg_ads_search_vector_update ON ads`);
        await client.query(`DROP TRIGGER trigger_ads_search_vector ON ads`);
        const { rows: only } = await client.query(
          `SELECT COUNT(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            WHERE c.relname = 'ads' AND NOT t.tgisinternal`
        );
        expect(only[0].n).toBe(1);
        const { rows: ins } = await client.query(
          `INSERT INTO ads (city_id, city, state, title, brand, model, commercial_model, description,
                            price, year, mileage, status, plan, slug, images)
           VALUES ($1,'Deltacity','SP','Zetatitle C2','Alfabrand','Betamodel','Gamacomm','Epsilondesc C2',
                   50000, 2022, 30000, 'active', 'free', $2, '[]'::jsonb)
           RETURNING search_vector::text AS sv`,
          [cityId, `c2-one-${runTag}`]
        );
        vOne = ins[0].sv;
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
      expect(vOne).toBe(vThree[0].sv);

      // a transação foi revertida: os três triggers continuam lá
      expect((await adsTriggers(db)).length).toBe(3);

      // ── 10. idempotência: aplicar a 070 de novo ──
      const { rows: snap } = await db.query(
        `SELECT id, search_vector::text AS sv FROM ads ORDER BY id`
      );
      await applyMigration070(db);
      const { rows: snap2 } = await db.query(
        `SELECT id, search_vector::text AS sv FROM ads ORDER BY id`
      );
      expect(snap2).toEqual(snap);
      expect((await adsTriggers(db)).length).toBe(3);
      const { rows: idxCount } = await db.query(
        `SELECT COUNT(*)::int AS n FROM pg_indexes WHERE tablename = 'ads' AND indexname = 'idx_ads_search_vector'`
      );
      expect(idxCount[0].n).toBe(1);
    });
  }, 300000);

  // ── 9 (rollback da aplicação) ──────────────────────────────────────────────
  it("ROLLBACK APP SAFE: o INSERT do ads.repository (com search_vector explícito) roda num banco 070", async () => {
    await withDatabase("rollback", async ({ db, env }) => {
      await runScript("scripts/run-migrations.mjs", env);
      const cityId = await seedProbeCity(db, {
        cityName: "Deltacity",
        slug: `deltacity-rb-${runTag}`,
        lat: -23.1171,
        lng: -46.5563,
      });

      // Lista de colunas e expressão IDÊNTICAS às de src/modules/ads/ads.repository.js
      // (a versão que o "commit anterior" executaria).
      const { rows } = await db.query(
        `INSERT INTO ads (city_id, city, state, title, brand, model, commercial_model, description,
                          price, year, mileage, status, plan, slug, images, search_vector)
         VALUES ($1,'Deltacity','SP','Zetatitle','Alfabrand','Betamodel','Gamacomm','Epsilondesc',
                 50000, 2022, 30000, 'active', 'free', $2, '[]'::jsonb,
                 to_tsvector('portuguese',
                   COALESCE('Alfabrand','') || ' ' || COALESCE('Betamodel','') || ' ' ||
                   COALESCE('Zetatitle','') || ' ' || COALESCE('Epsilondesc','')))
         RETURNING id`,
        [cityId, `rb-${runTag}`]
      );
      const adId = Number(rows[0].id);

      // O INSERT não falha e a leitura (única coisa que a app antiga faz) funciona:
      expect(await matchesPlain(db, adId, "Alfabrand")).toBe(true);
      expect(await matchesPlain(db, adId, "Zetatitle")).toBe(true);
      // e o valor explícito é descartado pelo trigger BEFORE — vetor canônico.
      expect(await weightMap(db, adId)).toEqual({
        gamacomm: "A",
        zetatitl: "A",
        alfabrand: "B",
        betamodel: "B",
        deltacity: "C",
        epsilondesc: "D",
      });
    });
  }, 300000);
});
