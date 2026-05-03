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
  return {
    connectionString,
    ssl: resolveSslConfig(connectionString, process.env),
  };
}

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));

function makeDbName(label) {
  return `rank_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
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
      process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-rank",
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

/**
 * Insere o conjunto mínimo de fixtures para testar a camada comercial:
 *   - 1 cidade (test-rank-tt).
 *   - 4 usuários com planos distintos (Pro, Start, Free CNPJ, Free CPF).
 *   - 4 advertisers ligados a esses usuários.
 *   - 4 anúncios — um por advertiser.
 *
 * Retorna mapa { proAdId, startAdId, freeCnpjAdId, freeCpfAdId, cityId }.
 *
 * Os anúncios são publicados no mesmo segundo para zerar o boost de
 * recência no hybrid_score. Isso isola a influência da camada comercial
 * do tiebreaker — sem isso, ad com `created_at` mais recente sempre
 * ganharia tiebreaker dentro da mesma camada.
 */
async function seedRankingFixtures(db) {
  const { rows: cityRows } = await db.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Test Rank', 'TT', 'test-rank-tt') RETURNING id`
  );
  const cityId = cityRows[0].id;

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

  const proUserId = await makeUser("pro@test.local", "cnpj-store-pro", "cnpj");
  const startUserId = await makeUser("start@test.local", "cnpj-store-start", "cnpj");
  const freeCnpjUserId = await makeUser("free-cnpj@test.local", "cnpj-free-store", "cnpj");
  const freeCpfUserId = await makeUser("free-cpf@test.local", "cpf-free-essential", "cpf");

  const proAdvId = await makeAdvertiser(proUserId, "Loja Pro");
  const startAdvId = await makeAdvertiser(startUserId, "Loja Start");
  const freeCnpjAdvId = await makeAdvertiser(freeCnpjUserId, "Loja Free CNPJ");
  const freeCpfAdvId = await makeAdvertiser(freeCpfUserId, "Vendedor Free CPF");

  // Mesma criação para todos: zera vantagem de recência no tiebreaker.
  const baseCreatedAt = new Date("2026-04-01T12:00:00Z").toISOString();

  async function makeAd({ advertiserId, title, highlightUntil = null }) {
    const { rows } = await db.query(
      `
      INSERT INTO ads (
        advertiser_id, city_id, title, brand, model, price, year, mileage, plan,
        status, slug, highlight_until, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'Honda', 'Civic', 75000, 2020, 50000, 'free',
        'active', $4, $5, $6, $6
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

  const proAdId = await makeAd({ advertiserId: proAdvId, title: "Anuncio Pro" });
  const startAdId = await makeAd({ advertiserId: startAdvId, title: "Anuncio Start" });
  const freeCnpjAdId = await makeAd({
    advertiserId: freeCnpjAdvId,
    title: "Anuncio Free CNPJ",
  });
  const freeCpfAdId = await makeAd({
    advertiserId: freeCpfAdvId,
    title: "Anuncio Free CPF",
  });

  return {
    cityId,
    proAdId,
    startAdId,
    freeCnpjAdId,
    freeCpfAdId,
    proAdvId,
    freeCpfAdvId,
    freeCnpjAdvId,
    startAdvId,
    proUserId,
    startUserId,
    freeCnpjUserId,
    freeCpfUserId,
  };
}

async function executeSearch(db, filters) {
  const { dataQuery, params } = buildAdsSearchQuery(filters);
  const result = await db.query(dataQuery, params);
  return result.rows.map((row) => row.id);
}

describe.sequential("integração — camadas comerciais (Destaque > Pro > Start > Grátis)", () => {
  beforeAll(async () => {
    await adminPool.query("SELECT 1");
  }, 30000);

  afterAll(async () => {
    await adminPool.end();
  }, 30000);

  it("ordem default no catálogo: Pro > Start > Free CNPJ > Free CPF", async () => {
    await withDatabase("default", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const seeded = await seedRankingFixtures(db);
        const ids = await executeSearch(db, { city_slug: "test-rank-tt", limit: 50 });

        expect(ids).toEqual([
          seeded.proAdId,
          seeded.startAdId,
          seeded.freeCnpjAdId,
          seeded.freeCpfAdId,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("destaque ativo (highlight_until > NOW) sobe Free CPF acima de Pro sem destaque", async () => {
    await withDatabase("highlight", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const seeded = await seedRankingFixtures(db);
        // Free CPF compra boost (R$ 39,90/7d) — vira camada 4 (Destaque).
        await db.query(
          `UPDATE ads SET highlight_until = NOW() + interval '7 days' WHERE id = $1`,
          [seeded.freeCpfAdId]
        );

        const ids = await executeSearch(db, { city_slug: "test-rank-tt", limit: 50 });

        expect(ids[0]).toBe(seeded.freeCpfAdId); // camada 4
        expect(ids[1]).toBe(seeded.proAdId); // camada 3
        expect(ids[2]).toBe(seeded.startAdId); // camada 2
        // Free CNPJ na camada 1 (priority_level=5)
        expect(ids[3]).toBe(seeded.freeCnpjAdId);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("destaque expirado (highlight_until < NOW) NÃO conta — anúncio cai para a camada do plano", async () => {
    await withDatabase("expired", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const seeded = await seedRankingFixtures(db);
        // Free CPF teve boost ano passado — expirado: deve voltar para camada 1.
        await db.query(
          `UPDATE ads SET highlight_until = NOW() - interval '30 days' WHERE id = $1`,
          [seeded.freeCpfAdId]
        );

        const ids = await executeSearch(db, { city_slug: "test-rank-tt", limit: 50 });

        // Pro (3) > Start (2) > Free CNPJ (1, prio_lvl=5) > Free CPF (1, prio_lvl=0, com highlight expirado).
        expect(ids).toEqual([
          seeded.proAdId,
          seeded.startAdId,
          seeded.freeCnpjAdId,
          seeded.freeCpfAdId,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("busca textual (q): correspondência textual respeita a intenção do visitante e nunca é atropelada por plano", async () => {
    await withDatabase("freesearch", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const seeded = await seedRankingFixtures(db);
        // Atualiza títulos para criar diferença textual: só Free CPF combina com "fusca".
        // Pro continua "Anuncio Pro" (sem "fusca").
        await db.query(
          `UPDATE ads SET title = 'Volkswagen Fusca 1978' WHERE id = $1`,
          [seeded.freeCpfAdId]
        );
        // Força repopular search_vector (trigger BEFORE UPDATE deve ter feito isso, mas
        // chamamos um UPDATE explícito por garantia).
        await db.query(`UPDATE ads SET updated_at = NOW() WHERE id = $1`, [seeded.freeCpfAdId]);

        const ids = await executeSearch(db, {
          city_slug: "test-rank-tt",
          q: "fusca",
          limit: 50,
        });

        // Só o anúncio do Free CPF combina com "fusca" — filtro WHERE elimina os outros.
        // Plano de Pro/Start não traz seus anúncios para a resposta.
        expect(ids).toEqual([seeded.freeCpfAdId]);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("anúncio fora do filtro NUNCA entra por ser Pro/Destaque (filtro é WHERE, não score)", async () => {
    await withDatabase("filter-respect", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const seeded = await seedRankingFixtures(db);

        // Marca todos os anúncios com brand 'Honda' (default da fixture). Trocamos só o do Pro
        // para 'Toyota'. Depois filtramos brand=Honda e Pro NÃO pode aparecer.
        await db.query(`UPDATE ads SET brand = 'Toyota' WHERE id = $1`, [seeded.proAdId]);

        const ids = await executeSearch(db, {
          city_slug: "test-rank-tt",
          brand: "Honda",
          limit: 50,
        });

        expect(ids).not.toContain(seeded.proAdId);
        // Order interna: Start (2) > Free CNPJ (1) > Free CPF (1).
        expect(ids).toEqual([seeded.startAdId, seeded.freeCnpjAdId, seeded.freeCpfAdId]);
      } finally {
        await db.end();
      }
    });
  }, 180000);

  it("sort=price_asc respeita preço (não injeta commercial_layer)", async () => {
    await withDatabase("price-sort", async ({ dbUrl }) => {
      await runNodeScript("scripts/run-migrations.mjs", buildBaseEnv(dbUrl));
      const db = await openPool(dbUrl);

      try {
        const seeded = await seedRankingFixtures(db);

        // Preços: Pro=80k, Start=70k, Free CNPJ=60k, Free CPF=50k.
        await db.query(`UPDATE ads SET price = 80000 WHERE id = $1`, [seeded.proAdId]);
        await db.query(`UPDATE ads SET price = 70000 WHERE id = $1`, [seeded.startAdId]);
        await db.query(`UPDATE ads SET price = 60000 WHERE id = $1`, [seeded.freeCnpjAdId]);
        await db.query(`UPDATE ads SET price = 50000 WHERE id = $1`, [seeded.freeCpfAdId]);

        const ids = await executeSearch(db, {
          city_slug: "test-rank-tt",
          sort: "price_asc",
          limit: 50,
        });

        // sort explícito do usuário: ordem por preço ASC, ignorando camada comercial.
        expect(ids).toEqual([
          seeded.freeCpfAdId,
          seeded.freeCnpjAdId,
          seeded.startAdId,
          seeded.proAdId,
        ]);
      } finally {
        await db.end();
      }
    });
  }, 180000);
});
