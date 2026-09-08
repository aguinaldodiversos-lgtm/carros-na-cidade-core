// tests/search-policy/region-memberships-sentinels.integration.test.js
//
// F1 §3.1 / §8.2 — sentinelas geográficas contra Postgres REAL, em banco
// descartável criado no mesmo servidor de DATABASE_URL/TEST_DATABASE_URL
// (padrão de tests/integration/region-memberships.integration.test.js).
//
// O que este arquivo prova, e que FALHA o build se ausente:
//   • braganca-paulista-sp ↔ extrema-mg 25,4 km; atibaia-sp ↔ extrema-mg 38,1 km;
//     atibaia-sp ↔ braganca-paulista-sp 18,3 km (±0,5) gravados em region_memberships;
//   • COUNT(*) WHERE b.state <> m.state > 0 (fronteira de UF caiu);
//   • self-row para toda cidade (inclusive sem coordenadas e cadastrada DEPOIS
//     da migration 021 — BUG-REG-01);
//   • índice idx_region_memberships_base_dist (migration 063);
//   • layer legado preservado (Atibaia = 1 em Bragança; Extrema = 4);
//   • --dry-run não grava; rebuild é idempotente; backup + rollback restauram;
//   • superconjunto: linha pré-existente sobrevive ao rebuild;
//   • recompute de UMA cidade (caminho do worker cities.geo-changed).
import dotenv from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../integration/helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
import { rollbackSql } from "../../src/modules/regions/region-memberships.builder.js";

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
const adminPool = new Pool({
  connectionString: adminUrl.toString(),
  ssl: resolveSslConfig(adminUrl.toString(), process.env),
});

function dbNameFor(label) {
  return `sp_sentinel_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
}
function urlFor(dbName) {
  const u = new URL(baseDatabaseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}
async function withDatabase(label, fn) {
  const dbName = dbNameFor(label);
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  try {
    return await fn(urlFor(dbName));
  } finally {
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
    JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-sp",
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

// Coordenadas REAIS (snapshot de produção 2026-09-07).
const CITIES = [
  ["Atibaia", "SP", "atibaia-sp", -23.1171, -46.5563],
  ["Bragança Paulista", "SP", "braganca-paulista-sp", -22.9527, -46.5419],
  ["Extrema", "MG", "extrema-mg", -22.854, -46.3178],
  ["Camanducaia", "MG", "camanducaia-mg", -22.7515, -46.1494],
  ["Campinas", "SP", "campinas-sp", -22.9053, -47.0659],
  ["Jundiaí", "SP", "jundiai-sp", -23.1852, -46.8974],
  ["Rio de Janeiro", "RJ", "rio-de-janeiro-rj", -22.9129, -43.2003],
  ["Sem Geo", "SP", "sem-geo-tt", null, null],
];

async function distance(db, a, b) {
  const { rows } = await db.query(
    `SELECT rm.distance_km::float AS km, rm.layer
     FROM region_memberships rm
     JOIN cities ca ON ca.id = rm.base_city_id
     JOIN cities cb ON cb.id = rm.member_city_id
     WHERE ca.slug = $1 AND cb.slug = $2`,
    [a, b]
  );
  return rows[0] || null;
}

afterAll(async () => {
  await adminPool.end();
});

describe.sequential("F1 — sentinelas de region_memberships (Postgres real)", () => {
  it("rebuild nacional: sentinelas, cross-UF, self-rows, índice, dry-run, idempotência, backup/rollback, recompute", async () => {
    await withDatabase("build", async (dbUrl) => {
      const env = envFor(dbUrl);
      await runScript("scripts/run-migrations.mjs", env);
      const db = new Pool({ connectionString: dbUrl, ssl: resolveSslConfig(dbUrl, process.env) });
      try {
        // Cidades cadastradas DEPOIS da migration 021 → sem self-row (BUG-REG-01).
        for (const [name, state, slug, lat, lng] of CITIES) {
          await db.query(
            `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES ($1,$2,$3,$4,$5)`,
            [name, state, slug, lat, lng]
          );
        }
        const { rows: idx } = await db.query(
          `SELECT indexname FROM pg_indexes WHERE tablename = 'region_memberships'`
        );
        expect(idx.map((r) => r.indexname)).toContain("idx_region_memberships_base_dist");

        // Linha "legada" pré-existente que o rebuild DEVE preservar (R3: superconjunto).
        const { rows: rio } = await db.query(
          `SELECT id FROM cities WHERE slug = 'rio-de-janeiro-rj'`
        );
        const { rows: sp } = await db.query(`SELECT id FROM cities WHERE slug = 'campinas-sp'`);
        await db.query(
          `INSERT INTO region_memberships (base_city_id, member_city_id, distance_km, layer) VALUES ($1,$2,999.99,3)`,
          [rio[0].id, sp[0].id]
        );
        const { rows: before } = await db.query(
          `SELECT COUNT(*)::int AS n FROM region_memberships`
        );
        expect(before[0].n).toBe(1);

        // --dry-run: contagens, nada gravado.
        const dry = await runScript("scripts/build-region-memberships.mjs", env, ["--dry-run"]);
        expect(dry).toContain("--dry-run: nada gravado");
        expect(dry).toMatch(/cross-UF: [1-9]/);
        const { rows: afterDry } = await db.query(
          `SELECT COUNT(*)::int AS n FROM region_memberships`
        );
        expect(afterDry[0].n).toBe(1);

        // Build real com backup nomeado.
        const out = await runScript("scripts/build-region-memberships.mjs", env, [
          "--backup-table=rm_backup_sentinel",
        ]);
        expect(out).toContain("backup: rm_backup_sentinel");

        // Sentinelas §3.1 (±0,5 km).
        const be = await distance(db, "braganca-paulista-sp", "extrema-mg");
        const ae = await distance(db, "atibaia-sp", "extrema-mg");
        const ab = await distance(db, "atibaia-sp", "braganca-paulista-sp");
        expect(be).not.toBeNull();
        expect(Math.abs(be.km - 25.4)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(ae.km - 38.1)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(ab.km - 18.3)).toBeLessThanOrEqual(0.5);
        // simetria
        const eb = await distance(db, "extrema-mg", "braganca-paulista-sp");
        expect(eb.km).toBe(be.km);

        // Cross-UF > 0.
        const { rows: cross } = await db.query(
          `SELECT COUNT(*)::int AS n FROM region_memberships rm
             JOIN cities b ON b.id = rm.base_city_id JOIN cities m ON m.id = rm.member_city_id
             WHERE b.state <> m.state`
        );
        expect(cross[0].n).toBeGreaterThan(0);

        // layer legado: Atibaia (18 km, SP) = 1 em Bragança; Extrema (MG) = 4; Campinas (54 km) = 2.
        expect(ab.layer).toBe(1);
        expect(be.layer).toBe(4);
        expect((await distance(db, "braganca-paulista-sp", "campinas-sp")).layer).toBe(2);

        // Self-row para TODAS as cidades (inclusive sem geo) — BUG-REG-01 fechado.
        const { rows: selfs } = await db.query(
          `SELECT COUNT(*)::int AS n FROM region_memberships WHERE base_city_id = member_city_id AND layer = 0 AND distance_km = 0`
        );
        const { rows: cityCount } = await db.query(`SELECT COUNT(*)::int AS n FROM cities`);
        expect(selfs[0].n).toBe(cityCount[0].n);

        // Sem geo: só a self-row.
        const { rows: semGeo } = await db.query(
          `SELECT COUNT(*)::int AS n FROM region_memberships rm JOIN cities c ON c.id = rm.base_city_id OR c.id = rm.member_city_id
             WHERE c.slug = 'sem-geo-tt' AND rm.base_city_id <> rm.member_city_id`
        );
        expect(semGeo[0].n).toBe(0);

        // Rio (> 150 km de todas) só tem self-row + a linha legada preservada.
        const { rows: rioRows } = await db.query(
          `SELECT member_city_id, distance_km::float AS km FROM region_memberships WHERE base_city_id = $1 ORDER BY km`,
          [rio[0].id]
        );
        expect(rioRows.map((r) => r.km)).toEqual([0, 999.99]);

        // Backup contém o estado anterior; superconjunto verificado.
        const { rows: bk } = await db.query(`SELECT COUNT(*)::int AS n FROM rm_backup_sentinel`);
        expect(bk[0].n).toBe(1);
        const { rows: total1 } = await db.query(
          `SELECT base_city_id, member_city_id, layer, distance_km FROM region_memberships ORDER BY 1,2`
        );
        expect(total1.length).toBeGreaterThan(cityCount[0].n);

        // ── Guard de compatibilidade (R4): o que os leitores legados veem ────
        //
        // Nenhuma linha NOVA pode receber layer 3: em produção o layer 3 só
        // existe para 180 bases, e atribuí-lo pela faixa 60–100 km faria
        // `layer <= 3` devolver outro conjunto. A única linha de layer 3 aqui é
        // a legada, inserida antes do build — e ela sobrevive com o MESMO layer
        // e a MESMA distância (regra 1: linha existente mantém o layer).
        const { rows: l3 } = await db.query(
          `SELECT base_city_id, member_city_id, distance_km::float AS km FROM region_memberships WHERE layer = 3`
        );
        expect(l3).toEqual([{ base_city_id: rio[0].id, member_city_id: sp[0].id, km: 999.99 }]);

        // A query REAL de getRadiusMembers (regional-radius.repository.js): com
        // o guard, a vizinha cross-UF (Extrema-MG, 25 km, layer 4) NÃO aparece —
        // exatamente como antes do rebuild. Sem o guard, apareceria.
        const radiusSql = (guard) => `
            SELECT m.slug
            FROM cities base
            JOIN region_memberships rm ON rm.base_city_id = base.id
            JOIN cities m ON m.id = rm.member_city_id
            WHERE base.slug = 'braganca-paulista-sp'
              ${guard}
              AND rm.distance_km IS NOT NULL
              AND rm.distance_km > 0
              AND rm.distance_km <= 100
            ORDER BY rm.distance_km ASC`;
        const comGuard = (await db.query(radiusSql("AND rm.layer <= 3"))).rows.map((r) => r.slug);
        const semGuard = (await db.query(radiusSql(""))).rows.map((r) => r.slug);
        expect(semGuard).toContain("extrema-mg");
        expect(comGuard).not.toContain("extrema-mg");
        expect(comGuard).not.toContain("camanducaia-mg");
        expect(comGuard).toContain("atibaia-sp");
        expect(semGuard.length).toBeGreaterThan(comGuard.length);

        // Idempotência: segundo build → mesmas linhas.
        await runScript("scripts/build-region-memberships.mjs", env, [
          "--backup-table=rm_backup_sentinel_2",
        ]);
        const { rows: total2 } = await db.query(
          `SELECT base_city_id, member_city_id, layer, distance_km FROM region_memberships ORDER BY 1,2`
        );
        expect(total2).toEqual(total1);

        // Recompute de UMA cidade: cadastra nova cidade sem geo, dá coordenadas, recomputa.
        const { rows: nova } = await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES ('Vargem','SP','vargem-sp',NULL,NULL) RETURNING id`
        );
        await db.query(`UPDATE cities SET latitude = -22.887, longitude = -46.4124 WHERE id = $1`, [
          nova[0].id,
        ]);
        await runScript("scripts/recompute-city-memberships.mjs", env, ["vargem-sp"]);
        const vb = await distance(db, "vargem-sp", "braganca-paulista-sp");
        const bv = await distance(db, "braganca-paulista-sp", "vargem-sp");
        expect(vb).not.toBeNull();
        expect(Math.abs(vb.km - 15.1)).toBeLessThanOrEqual(0.5); // auditoria §7.5: vargem-sp 15,14
        expect(bv.km).toBe(vb.km);
        expect(bv.layer).toBe(1); // mesma UF, ≤30 km, Bragança tem vaga no layer 1
        const ve = await distance(db, "vargem-sp", "extrema-mg");
        expect(ve.layer).toBe(4);
        const { rows: vSelf } = await db.query(
          `SELECT layer FROM region_memberships WHERE base_city_id = $1 AND member_city_id = $1`,
          [nova[0].id]
        );
        expect(vSelf[0].layer).toBe(0);

        // Rollback a partir do PRIMEIRO backup restaura o estado pré-build (1 linha legada).
        await db.query(rollbackSql("rm_backup_sentinel"));
        const { rows: restored } = await db.query(
          `SELECT base_city_id, member_city_id, distance_km::float AS km FROM region_memberships`
        );
        expect(restored).toEqual([
          { base_city_id: rio[0].id, member_city_id: sp[0].id, km: 999.99 },
        ]);
      } finally {
        await db.end();
      }
    });
  }, 300000);
});
