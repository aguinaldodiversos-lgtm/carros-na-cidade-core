// tests/search-policy/d1-shadow-safety.integration.test.js
//
// F2.2-D1 — segurança operacional do shadow, contra Postgres REAL (banco
// descartável). A F2.2-D0 provou que o `Promise.race` de 300 ms só limitava o
// RELATO: a query perdedora seguia viva no Postgres segurando conexão. Aqui:
//
//   C  statement_timeout real — pg_sleep é cancelado pelo banco (57014);
//   B  timeout lógico — sob lock em `ads`, a comparação perde a race, e as
//      queries do shadow NÃO continuam ativas depois do retorno;
//   D  conexão — com pool de 1 conexão, a próxima query normal roda com o lock
//      AINDA preso (a conexão não ficou presa atrás dele);
//   E  isolamento — depois do release, a MESMA conexão física (mesmo pid)
//      volta com `statement_timeout = 0`; e uma query normal de 600 ms rodando
//      em paralelo com o shadow não é cancelada;
//   F  concorrência — com teto 2, cinco comparações simultâneas: 2 entram,
//      3 são descartadas na hora, nunca há mais de 2 backends do shadow;
//   +  a telemetria de timeout continua sendo gravada (sem regressão).
//
// "Lock em ads" é o jeito determinístico de produzir uma query lenta usando o
// código REAL do motor, sem stub: toda leitura de `ads` espera o lock, e
// statement_timeout conta o tempo de espera por lock.
import dotenv from "dotenv";
import process from "node:process";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../integration/helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";
import {
  SHADOW_MAX_CONCURRENCY_DEFAULT,
  SHADOW_STATEMENT_TIMEOUT_MS,
  SHADOW_TIMEOUT_MS,
  __shadowTesting,
  getShadowMaxConcurrency,
  runShadowComparison,
  withShadowStatementTimeout,
} from "../../src/modules/ads/search-policy/engine.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

dotenv.config({ override: false });

const { Pool, Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;
const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `sp_d1_${runTag}`.toLowerCase();
const LEGACY = { data: [{ id: 999 }], pagination: { total: 1 } };
const QUERY = { city_slug: "atibaia-sp" };

let adminPool;
let dbUrl;
let tearingDown = false;
const openPools = [];

function sslFor(url) {
  return resolveSslConfig(url, process.env);
}

function newPool(appName, max) {
  const p = new Pool({
    connectionString: dbUrl,
    ssl: sslFor(dbUrl),
    max,
    application_name: appName,
  });
  // O cleanup pode precisar encerrar uma conexão que ainda está fechando no
  // servidor. Nesse instante o pg emite 57P01 ("administrator command") no
  // Pool; durante o teardown isso é esperado. Fora do teardown, qualquer erro
  // continua derrubando o teste normalmente.
  p.on("error", (err) => {
    if (tearingDown && String(err?.code) === "57P01") return;
    throw err;
  });
  openPools.push(p);
  return p;
}

function runScript(relPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workspaceRoot, relPath)], {
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

/** Trava `ads` numa sessão separada; devolve a função que solta. */
async function lockAds() {
  const c = new Client({
    connectionString: dbUrl,
    ssl: sslFor(dbUrl),
    application_name: "d1-locker",
  });
  await c.connect();
  await c.query("BEGIN");
  await c.query("LOCK TABLE ads IN ACCESS EXCLUSIVE MODE");
  return async () => {
    await c.query("ROLLBACK").catch(() => {});
    await c.end().catch(() => {});
  };
}

/** Backends NÃO ociosos de um application_name. */
async function activeBackends(appName) {
  const { rows } = await adminPool.query(
    `SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname = $1 AND application_name = $2 AND state <> 'idle'`,
    [dbName, appName]
  );
  return rows[0].n;
}

async function waitFor(fn, { timeoutMs = 1500, stepMs = 25 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

function shadow(db, extra = {}) {
  return runShadowComparison(QUERY, LEGACY, {
    db,
    policy: SEARCH_POLICY_DEFAULT,
    cache: false,
    path: "/api/ads/search?d1",
    ...extra,
  });
}

beforeAll(async () => {
  const adminUrl = new URL(baseDatabaseUrl);
  adminUrl.pathname = "/postgres";
  adminPool = new Pool({ connectionString: adminUrl.toString(), ssl: sslFor(adminUrl.toString()) });
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  const u = new URL(baseDatabaseUrl);
  u.pathname = `/${dbName}`;
  dbUrl = u.toString();
  await runScript("scripts/run-migrations.mjs", {
    ...process.env,
    DATABASE_URL: dbUrl,
    TEST_DATABASE_URL: dbUrl,
    NODE_ENV: "test",
    LOG_LEVEL: "warn",
  });
  const seed = newPool("d1-seed", 1);
  await seed.query(
    `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES ('Atibaia','SP','atibaia-sp',-23.1171,-46.5563)`
  );
  await seed.query(
    `INSERT INTO ads (city_id, city, state, title, brand, model, commercial_model, price, year, status, slug, images)
     SELECT id, 'Atibaia', 'SP', 'Onix LT', 'GM - Chevrolet', 'ONIX LT 1.0', 'Onix', 50000, 2022, 'active', $1, '[]'::jsonb
       FROM cities WHERE slug = 'atibaia-sp'`,
    [`d1-${runTag}`]
  );
}, 300000);

afterAll(async () => {
  tearingDown = true;
  for (const p of openPools) await p.end().catch(() => {});
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await adminPool.end();
});

beforeEach(() => {
  __shadowTesting.reset();
  resetDictionariesForTests();
  __policyCacheTesting.reset();
  delete process.env.SEARCH_POLICY_SHADOW_MAX_CONCURRENCY;
});

describe("F2.2-D1 — contrato das constantes e do limitador (puro)", () => {
  it("statement_timeout do shadow é o MESMO orçamento da race (300 ms)", () => {
    expect(SHADOW_TIMEOUT_MS).toBe(300);
    expect(SHADOW_STATEMENT_TIMEOUT_MS).toBe(SHADOW_TIMEOUT_MS);
  });

  it("teto de concorrência: default 2; só inteiro ≥ 1 é aceito", () => {
    expect(SHADOW_MAX_CONCURRENCY_DEFAULT).toBe(2);
    expect(getShadowMaxConcurrency({})).toBe(2);
    expect(getShadowMaxConcurrency({ SEARCH_POLICY_SHADOW_MAX_CONCURRENCY: "5" })).toBe(5);
    for (const bad of ["", "0", "-1", "1.5", "abc", " "]) {
      expect(getShadowMaxConcurrency({ SEARCH_POLICY_SHADOW_MAX_CONCURRENCY: bad }), bad).toBe(2);
    }
  });
});

describe.sequential("F2.2-D1 — shadow sob Postgres real", () => {
  it("C: pg_sleep dentro do envelope do shadow é cancelado pelo banco (57014) em ~300 ms", async () => {
    const db = newPool("d1-sleep", 2);
    const t0 = Date.now();
    const err = await withShadowStatementTimeout(db, (client) =>
      client.query("SELECT pg_sleep(2)")
    ).catch((e) => e);
    const elapsed = Date.now() - t0;
    expect(err?.code).toBe("57014");
    expect(elapsed).toBeLessThan(1500); // sem o limite, seriam ≥ 2000
    expect(await activeBackends("d1-sleep")).toBe(0);
    expect(db.idleCount).toBe(db.totalCount);
  });

  it("B + C: sob lock, a race perde e as queries do shadow NÃO seguem vivas no banco", async () => {
    const db = newPool("d1-race", 4);
    const release = await lockAds();
    try {
      const t0 = Date.now();
      const out = await shadow(db);
      expect(out.timedOut).toBe(true);
      expect(Date.now() - t0).toBeLessThan(1500);

      // Com o lock AINDA preso por mais ~2 s: sem statement_timeout, os backends
      // ficariam `active` esperando lock até o ROLLBACK do locker.
      const drained = await waitFor(async () => (await activeBackends("d1-race")) === 0, {
        timeoutMs: 1000,
      });
      expect(drained).toBe(true);
      expect(await waitFor(() => __shadowTesting.inFlight() === 0, { timeoutMs: 1000 })).toBe(true);
      await new Promise((r) => setTimeout(r, 1000));
      expect(await activeBackends("d1-race")).toBe(0);
    } finally {
      await release();
    }
  });

  it("D: pool de UMA conexão — a próxima query normal roda com o lock ainda preso", async () => {
    const db = newPool("d1-one", 1);
    const release = await lockAds();
    try {
      const out = await shadow(db);
      expect(out.timedOut).toBe(true);
      const t0 = Date.now();
      const { rows } = await db.query("SELECT 1 AS ok");
      expect(rows[0].ok).toBe(1);
      expect(Date.now() - t0).toBeLessThan(1500);
      expect(db.totalCount).toBeLessThanOrEqual(1);
    } finally {
      await release();
    }
  });

  it("race: ROLLBACK lento não transforma comparação concluída no prazo em timeout", async () => {
    const base = newPool("d1-rollback-race", 2);
    const delayMs = 700;
    const db = {
      query: (...args) => base.query(...args),
      async connect() {
        const client = await base.connect();
        return {
          async query(text, params) {
            const sql = String(text);
            if (sql.includes("SET LOCAL statement_timeout")) {
              const relaxed = sql.replace("300ms", "2000ms");
              return client.query(relaxed, params);
            }
            if (sql.trim() === "ROLLBACK") {
              await new Promise((r) => setTimeout(r, delayMs));
            }
            return client.query(text, params);
          },
          release: (err) => client.release(err),
        };
      },
    };

    const t0 = Date.now();
    const out = await shadow(db, { timeoutMs: 500 });
    const wall = Date.now() - t0;

    expect(out).not.toBeNull();
    expect(out.timedOut).toBe(false);
    expect(out.elapsed_ms).toBeLessThan(500);
    // A função ainda espera o cleanup antes da telemetria/retorno: segurança de
    // conexão preservada, mas o housekeeping não redefine o resultado da race.
    expect(wall).toBeGreaterThanOrEqual(delayMs);
    expect(__shadowTesting.inFlight()).toBe(0);
  });

  it("E: depois do release, a MESMA conexão (mesmo pid) volta com statement_timeout = 0", async () => {
    const db = newPool("d1-iso", 1);
    const before = await db.query(
      "SELECT pg_backend_pid() AS pid, current_setting('statement_timeout') AS st"
    );
    expect(before.rows[0].st).toBe("0");

    // caminho de SUCESSO (sem lock)
    const ok = await shadow(db);
    expect(ok.timedOut).toBe(false);
    const afterOk = await db.query(
      "SELECT pg_backend_pid() AS pid, current_setting('statement_timeout') AS st"
    );
    expect(afterOk.rows[0].pid).toBe(before.rows[0].pid);
    expect(afterOk.rows[0].st).toBe("0");

    // caminho de TIMEOUT (com lock)
    const release = await lockAds();
    try {
      const to = await shadow(db);
      expect(to.timedOut).toBe(true);
    } finally {
      await release();
    }
    const show = await db.query("SHOW statement_timeout");
    expect(show.rows[0].statement_timeout).toBe("0");
    const afterTo = await db.query("SELECT pg_backend_pid() AS pid");
    expect(afterTo.rows[0].pid).toBe(before.rows[0].pid);
  });

  it("E: query normal de 600 ms em paralelo com o shadow NÃO recebe o limite curto", async () => {
    const db = newPool("d1-par", 3);
    const release = await lockAds();
    try {
      const shadowRun = shadow(db);
      const normal = db.query("SELECT pg_sleep(0.6), 'normal' AS tag");
      const [s, n] = await Promise.all([shadowRun, normal]);
      expect(s.timedOut).toBe(true);
      expect(n.rows[0].tag).toBe("normal");
    } finally {
      await release();
    }
  });

  it("F: teto 2 — cinco comparações simultâneas: 2 entram, 3 descartadas na hora, nunca > 2 backends", async () => {
    process.env.SEARCH_POLICY_SHADOW_MAX_CONCURRENCY = "2";
    const db = newPool("d1-conc", 10);
    const release = await lockAds();
    let peak = 0;
    let peakCheckedOut = 0;
    let sampling = true;
    // Duas medições: backends no banco (grossa, por round-trip) e conexões
    // EMPRESTADAS do pool, amostradas em processo a cada tick (exata). A 1ª
    // versão desta fase deixava a telemetria pegar uma 2ª conexão enquanto a da
    // comparação ainda fazia ROLLBACK — 4 backends com teto 2.
    const sampler = (async () => {
      while (sampling) {
        peak = Math.max(peak, await activeBackends("d1-conc"));
        await new Promise((r) => setTimeout(r, 10));
      }
    })();
    const tick = () => {
      peakCheckedOut = Math.max(peakCheckedOut, db.totalCount - db.idleCount);
      if (sampling) setImmediate(tick);
    };
    setImmediate(tick);
    try {
      const t0 = Date.now();
      const outs = await Promise.all([1, 2, 3, 4, 5].map(() => shadow(db)));
      const skipped = outs.filter((o) => o?.skipped_reason === "shadow_saturated");
      const ran = outs.filter((o) => o && o.skipped !== true);
      expect(skipped.length).toBe(3);
      expect(ran.length).toBe(2);
      expect(ran.every((o) => o.timedOut === true)).toBe(true);
      expect(__shadowTesting.skippedSaturated()).toBe(3);
      expect(Date.now() - t0).toBeLessThan(1500); // nenhum descartado ficou em fila
      expect(await waitFor(() => __shadowTesting.inFlight() === 0, { timeoutMs: 1500 })).toBe(true);
    } finally {
      sampling = false;
      await sampler;
      await release();
    }
    expect(peak).toBeGreaterThan(0); // o amostrador viu o shadow — não é vacuoso
    expect(peak).toBeLessThanOrEqual(2);
    expect(peakCheckedOut).toBeGreaterThan(0);
    expect(peakCheckedOut).toBeLessThanOrEqual(2);
  });

  // F2.2-D1R-S: sem contagem concluída não há total_count/seller_count reais,
  // então o timeout NÃO grava search.executed (DEC-27 / V3-INV-052). O
  // diagnóstico passou para o contador do processo.
  it("telemetria: o timeout NÃO grava search.executed e conta no diagnóstico do processo", async () => {
    const db = newPool("d1-tel", 2);
    const count = async () =>
      (
        await db.query(
          `SELECT COUNT(*)::int AS n FROM analytics_events WHERE event_type = 'search.executed' AND path = '/api/ads/search?d1'`
        )
      ).rows[0].n;
    const before = await count();
    const release = await lockAds();
    try {
      const out = await shadow(db);
      expect(out.timedOut).toBe(true);
      expect(out.new_count).toBeNull();
    } finally {
      await release();
    }
    expect(await count()).toBe(before);
    expect(__shadowTesting.timedOut()).toBe(1);

    // Controle: sem o lock, a MESMA comparação conclui e grava 1 evento — o
    // zero acima não é o INSERT falhando por outro motivo.
    const ok = await shadow(db, { timeoutMs: 5000 });
    expect(ok.timedOut).toBe(false);
    expect(await count()).toBe(before + 1);
    expect(__shadowTesting.timedOut()).toBe(1);
  });
});