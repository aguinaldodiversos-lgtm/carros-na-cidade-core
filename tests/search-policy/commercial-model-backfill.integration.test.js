// tests/search-policy/commercial-model-backfill.integration.test.js
//
// F1 §3.2 — migration 064 + backfill de ads.commercial_model contra Postgres
// real (banco descartável). Prova:
//   • coluna e índice existem; trigger versionado dispara em UPDATE OF commercial_model;
//   • backfill --dry-run não grava e lista os NULL;
//   • backfill preenche o rótulo (Onix ×4 → uma entidade; "5 Luxury" → "Omoda 5");
//   • não derivável → NULL, sem bloquear;
//   • search_vector recebe o modelo comercial com peso A;
//   • segunda execução = 0 updates (idempotente); ads.model intocado;
//   • INSERT com commercial_model (caminho do ads.repository) também vetoriza em A.
import dotenv from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../integration/helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

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

async function withDatabase(label, fn) {
  const dbName = `sp_cm_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  const u = new URL(baseDatabaseUrl);
  u.pathname = `/${dbName}`;
  try {
    return await fn(u.toString());
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
    JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-cm",
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

// Valores LITERAIS de produção (auditoria §7.5 K3 + commercial-model.fixtures.js).
const ADS = [
  ["GM - Chevrolet", "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", "active"],
  ["GM - Chevrolet", "ONIX HATCH LT 1.0 12V Flex 5p Mec.", "active"],
  ["GM - Chevrolet", "ONIX HATCH 1.0 12V Flex 5p Mec.", "active"],
  ["GM - Chevrolet", "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.", "paused"],
  ["Omoda", "5 Luxury 1.5 TB FWD", "active"],
  ["Toyota", "COROLLA CROSS XRE 2.0 16V Flex Aut.", "active"],
  ["Fiat", "1.0 12V Flex", "active"], // anômalo → NULL
];

afterAll(async () => {
  await adminPool.end();
});

describe.sequential("F1 — ads.commercial_model: migration 064 + backfill (Postgres real)", () => {
  it("coluna, índice, trigger, dry-run, backfill, peso A no search_vector, idempotência", async () => {
    await withDatabase("backfill", async (dbUrl) => {
      const env = envFor(dbUrl);
      await runScript("scripts/run-migrations.mjs", env);
      const db = new Pool({ connectionString: dbUrl, ssl: resolveSslConfig(dbUrl, process.env) });
      try {
        const { rows: col } = await db.query(
          `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'ads' AND column_name = 'commercial_model'`
        );
        expect(col.length).toBe(1);
        expect(col[0].is_nullable).toBe("YES");
        const { rows: idx } = await db.query(
          `SELECT indexname FROM pg_indexes WHERE tablename = 'ads'`
        );
        expect(idx.map((r) => r.indexname)).toContain("idx_ads_commercial_model_status");
        const { rows: trg } = await db.query(
          `SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname = 'ads_search_vector_trigger'`
        );
        expect(trg[0].def).toMatch(/UPDATE OF brand, model, title, description, commercial_model/);

        const { rows: city } = await db.query(
          `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES ('Atibaia','SP','atibaia-sp',-23.1171,-46.5563) RETURNING id`
        );
        const ids = [];
        for (const [brand, model, status] of ADS) {
          const { rows } = await db.query(
            `INSERT INTO ads (city_id, city, state, title, brand, model, price, year, status, slug)
               VALUES ($1,'Atibaia','SP',$2,$3,$4, 50000, 2022, $5, $6) RETURNING id`,
            [city[0].id, `${brand} ${model}`, brand, model, status, `ad-${ids.length}-${runTag}`]
          );
          ids.push(rows[0].id);
        }

        // Dry-run: lista NULL, não grava.
        const dry = await runScript("scripts/backfill-ads-commercial-model.mjs", env, [
          "--dry-run",
        ]);
        expect(dry).toContain("--dry-run");
        expect(dry).toMatch(/NULL \(não derivável\): 1/);
        expect(dry).toContain("1.0 12V Flex");
        const { rows: stillNull } = await db.query(
          `SELECT COUNT(*)::int AS n FROM ads WHERE commercial_model IS NOT NULL`
        );
        expect(stillNull[0].n).toBe(0);

        // Backfill real.
        const out = await runScript("scripts/backfill-ads-commercial-model.mjs", env);
        expect(out).toMatch(/6 linhas atualizadas/);
        expect(out).toMatch(/search_vector sem o modelo comercial: 0/);

        const { rows: got } = await db.query(
          `SELECT brand, model, commercial_model, status FROM ads ORDER BY id`
        );
        expect(got.map((r) => r.commercial_model)).toEqual([
          "Onix",
          "Onix",
          "Onix",
          "Onix",
          "Omoda 5",
          "Corolla Cross",
          null,
        ]);
        // ads.model intocado.
        expect(got.map((r) => r.model)).toEqual(ADS.map((a) => a[1]));

        // Faceta "Modelo" agregando commercial_model: Onix = 3 ativos (o pausado fica fora).
        const { rows: facet } = await db.query(
          `SELECT commercial_model, COUNT(*)::int AS n FROM ads WHERE status = 'active' AND commercial_model IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1`
        );
        expect(facet[0]).toEqual({ commercial_model: "Onix", n: 3 });

        // Peso A: só lexemas com peso A casam `onix:A`.
        const { rows: weightA } = await db.query(
          `SELECT COUNT(*)::int AS n FROM ads WHERE ts_rank(search_vector, to_tsquery('portuguese', 'onix:A')) > 0`
        );
        expect(weightA[0].n).toBe(4);
        const { rows: omoda } = await db.query(
          `SELECT COUNT(*)::int AS n FROM ads WHERE search_vector @@ plainto_tsquery('portuguese', 'omoda 5')`
        );
        expect(omoda[0].n).toBe(1);

        // Idempotência.
        const again = await runScript("scripts/backfill-ads-commercial-model.mjs", env);
        expect(again).toMatch(/0 linhas atualizadas/);

        // Caminho de escrita do anúncio (ads.repository grava a coluna no INSERT): vetoriza em A.
        await db.query(
          `INSERT INTO ads (city_id, city, state, title, brand, model, commercial_model, price, year, status, slug)
             VALUES ($1,'Atibaia','SP','HB20 Vision','Hyundai','HB20 Vision 1.0 Flex','HB20', 60000, 2023, 'active', $2)`,
          [city[0].id, `ad-hb20-${runTag}`]
        );
        const { rows: hb } = await db.query(
          `SELECT COUNT(*)::int AS n FROM ads WHERE ts_rank(search_vector, to_tsquery('portuguese', 'hb20:A')) > 0`
        );
        expect(hb[0].n).toBe(1);
      } finally {
        await db.end();
      }
    });
  }, 300000);
});
