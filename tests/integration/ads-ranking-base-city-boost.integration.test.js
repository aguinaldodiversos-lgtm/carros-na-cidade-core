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
  return `basecityboost_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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
      process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-basecity",
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
 * Constrói 8 anúncios em duas cidades (base + vizinha), 4 por cidade,
 * um por camada comercial (Destaque/Pro/Start/Free). Todos com o mesmo
 * created_at (mesma fixture base) e mesmo a.priority=1 para isolar o
 * boost cidade-base.
 *
 * Retorna mapa { id por (cidade, plano) } para asserts.
 */
async function seedFixtures(db) {
  const { rows: cityRows } = await db.query(
    `INSERT INTO cities (name, state, slug) VALUES
     ('Cidade Base',    'TT', 'cidade-base-tt'),
     ('Cidade Vizinha', 'TT', 'cidade-vizinha-tt')
     RETURNING id, slug`
  );
  const cityIds = Object.fromEntries(cityRows.map((r) => [r.slug, r.id]));

  async function makeUser(email, planId, documentType) {
    const { rows } = await db.query(
      `INSERT INTO users (email, plan_id, document_type, document_verified)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [email, planId, documentType]
    );
    return rows[0].id;
  }

  async function makeAdvertiser(userId, name) {
    const { rows } = await db.query(
      `INSERT INTO advertisers (user_id, name) VALUES ($1, $2) RETURNING id`,
      [userId, name]
    );
    return rows[0].id;
  }

  // 4 usuários distintos, 1 por camada comercial.
  const users = {
    pro: await makeUser("pro@bc.local", "cnpj-store-pro", "cnpj"),
    start: await makeUser("start@bc.local", "cnpj-store-start", "cnpj"),
    freeCnpj: await makeUser("free@bc.local", "cnpj-free-store", "cnpj"),
    freeCpf: await makeUser("freecpf@bc.local", "cpf-free-essential", "cpf"),
  };

  // 8 advertisers (4 planos × 2 cidades). Mesmo dono pode ter advertisers
  // distintos, mas para isolar fixture, criamos 1 advertiser por (plano, cidade).
  const advertisers = {};
  for (const [plan, userId] of Object.entries(users)) {
    advertisers[`${plan}-base`] = await makeAdvertiser(userId, `${plan} base`);
    advertisers[`${plan}-vizinha`] = await makeAdvertiser(userId, `${plan} vizinha`);
  }

  const baseCreatedAt = new Date("2026-04-01T12:00:00Z").toISOString();

  async function makeAd({ advertiserId, cityId, title, highlightUntil = null }) {
    const { rows } = await db.query(
      `
      INSERT INTO ads (
        advertiser_id, city_id, title, brand, model, price, year, mileage, plan,
        priority, status, slug, highlight_until, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'Honda', 'Civic', 75000, 2020, 50000, 'free',
        1, 'active', $4, $5, $6, $6
      ) RETURNING id
      `,
      [
        advertiserId,
        title,
        `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${advertiserId}`,
        highlightUntil,
        baseCreatedAt,
      ]
    );
    return rows[0].id;
  }

  // 8 anúncios, em "matriz" (plano × cidade). highlight_until só no Destaque (Free CPF + boost).
  const ads = {};

  // Destaque ativo: usamos Free CPF + highlight_until > NOW (boost avulso simulado).
  ads.destaqueBase = await makeAd({
    advertiserId: advertisers["freeCpf-base"],
    cityId: cityIds["cidade-base-tt"],
    title: "Destaque Base",
    highlightUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  ads.destaqueVizinha = await makeAd({
    advertiserId: advertisers["freeCpf-vizinha"],
    cityId: cityIds["cidade-vizinha-tt"],
    title: "Destaque Vizinha",
    highlightUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Pro (sem destaque): só plano.
  ads.proBase = await makeAd({
    advertiserId: advertisers["pro-base"],
    cityId: cityIds["cidade-base-tt"],
    title: "Pro Base",
  });
  ads.proVizinha = await makeAd({
    advertiserId: advertisers["pro-vizinha"],
    cityId: cityIds["cidade-vizinha-tt"],
    title: "Pro Vizinha",
  });

  // Start.
  ads.startBase = await makeAd({
    advertiserId: advertisers["start-base"],
    cityId: cityIds["cidade-base-tt"],
    title: "Start Base",
  });
  ads.startVizinha = await makeAd({
    advertiserId: advertisers["start-vizinha"],
    cityId: cityIds["cidade-vizinha-tt"],
    title: "Start Vizinha",
  });

  // Free CNPJ (camada 1, mas priority_level=5).
  ads.freeBase = await makeAd({
    advertiserId: advertisers["freeCnpj-base"],
    cityId: cityIds["cidade-base-tt"],
    title: "Free Base",
  });
  ads.freeVizinha = await makeAd({
    advertiserId: advertisers["freeCnpj-vizinha"],
    cityId: cityIds["cidade-vizinha-tt"],
    title: "Free Vizinha",
  });

  return { ads, cityIds };
}

async function searchOrder(db, filters) {
  const { dataQuery, params } = buildAdsSearchQuery(filters);
  const result = await db.query(dataQuery, params);
  return result.rows.map((row) => row.id);
}

describe.sequential("integração — preferência cidade-base no ranking multi-cidade", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("dentro da MESMA camada Pro: anúncio da cidade-base ranqueia acima da vizinha", async () => {
    await withDatabase("pro-vs-pro", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        const proBaseIdx = ids.indexOf(ads.proBase);
        const proVizinhaIdx = ids.indexOf(ads.proVizinha);
        expect(proBaseIdx).toBeGreaterThanOrEqual(0);
        expect(proVizinhaIdx).toBeGreaterThanOrEqual(0);
        expect(proBaseIdx).toBeLessThan(proVizinhaIdx);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("dentro da MESMA camada Start: cidade-base acima da vizinha", async () => {
    await withDatabase("start-vs-start", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        expect(ids.indexOf(ads.startBase)).toBeLessThan(ids.indexOf(ads.startVizinha));
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("dentro da MESMA camada Free CNPJ: cidade-base acima da vizinha", async () => {
    await withDatabase("free-vs-free", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        expect(ids.indexOf(ads.freeBase)).toBeLessThan(ids.indexOf(ads.freeVizinha));
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("INVARIANTE: Destaque de vizinha continua acima de Pro da cidade-base (camada NÃO inverte)", async () => {
    await withDatabase("destaque-vs-pro", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        // Destaque (camada 4) DOMINA Pro (camada 3) mesmo com cidade-base no Pro
        // — boost de 60 pontos não atravessa a fronteira de camada (highlight*125).
        expect(ids.indexOf(ads.destaqueVizinha)).toBeLessThan(ids.indexOf(ads.proBase));
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("INVARIANTE: Pro de vizinha continua acima de Start da cidade-base", async () => {
    await withDatabase("pro-vs-start", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        expect(ids.indexOf(ads.proVizinha)).toBeLessThan(ids.indexOf(ads.startBase));
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("INVARIANTE: Start de vizinha continua acima de Free da cidade-base", async () => {
    await withDatabase("start-vs-free", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        expect(ids.indexOf(ads.startVizinha)).toBeLessThan(ids.indexOf(ads.freeBase));
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("ordem completa esperada com city_slugs=[base, vizinha]: 8 anúncios em ordem comercial-com-base-preferida", async () => {
    await withDatabase("ordem-completa", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          limit: 50,
        });

        // Camada 4 (Destaque): base > vizinha.
        // Camada 3 (Pro):     base > vizinha.
        // Camada 2 (Start):   base > vizinha.
        // Camada 1 (Free):    base > vizinha.
        expect(ids).toEqual([
          ads.destaqueBase,
          ads.destaqueVizinha,
          ads.proBase,
          ads.proVizinha,
          ads.startBase,
          ads.startVizinha,
          ads.freeBase,
          ads.freeVizinha,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("city_slug singular (sem city_slugs) NÃO ativa boost — comportamento antigo intacto", async () => {
    await withDatabase("singular-intacto", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        // Filtra só pela cidade-vizinha. O boost da base não pode beneficiar
        // a vizinha (e o Pro vizinha ainda assim deve estar acima do Start
        // vizinha por commercial_layer).
        const ids = await searchOrder(db, {
          city_slug: "cidade-vizinha-tt",
          limit: 50,
        });

        // Só anúncios da vizinha aparecem.
        const allowed = new Set([
          ads.destaqueVizinha,
          ads.proVizinha,
          ads.startVizinha,
          ads.freeVizinha,
        ]);
        for (const id of ids) {
          expect(allowed.has(id)).toBe(true);
        }

        // Ordem comercial preservada dentro da cidade.
        expect(ids).toEqual([
          ads.destaqueVizinha,
          ads.proVizinha,
          ads.startVizinha,
          ads.freeVizinha,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("city_slugs com 1 cidade NÃO aplica boost (comportamento equivalente a city_slug singular)", async () => {
    await withDatabase("multi-degenera-singular", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads } = await seedFixtures(db);

        const ids = await searchOrder(db, {
          city_slugs: ["cidade-vizinha-tt"],
          limit: 50,
        });

        // Mesma ordem que o caso singular (boost não dispara com length === 1).
        expect(ids).toEqual([
          ads.destaqueVizinha,
          ads.proVizinha,
          ads.startVizinha,
          ads.freeVizinha,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 240000);

  it("base_city_id no filtro é IGNORADO (segurança: visitante não manipula boost)", async () => {
    await withDatabase("seguranca-base-city-id", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);
      try {
        const { ads, cityIds } = await seedFixtures(db);

        // Tenta forçar a base como cidade-vizinha (id), mantendo city_slugs[0]
        // = cidade-base-tt. O builder deve IGNORAR base_city_id e usar
        // city_slugs[0] como autoridade.
        const ids = await searchOrder(db, {
          city_slugs: ["cidade-base-tt", "cidade-vizinha-tt"],
          base_city_id: cityIds["cidade-vizinha-tt"], // injeção tentada
          limit: 50,
        });

        // O resultado deve ser idêntico ao caso "ordem-completa" — base
        // continua sendo cidade-base-tt, não cidade-vizinha-tt.
        expect(ids).toEqual([
          ads.destaqueBase,
          ads.destaqueVizinha,
          ads.proBase,
          ads.proVizinha,
          ads.startBase,
          ads.startVizinha,
          ads.freeBase,
          ads.freeVizinha,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 240000);
});
