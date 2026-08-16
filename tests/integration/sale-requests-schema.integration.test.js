import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * O ESQUEMA das migrations 052/053 contra PostgreSQL de verdade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO NÃO PODE SER TESTE UNITÁRIO
 * ────────────────────────────────────────────────────────────────────────────
 * O fake-db é um array em memória. Ele pode até imitar o `UNIQUE` de
 * `storage_key` (e imita), mas não imita CHECK constraint, FK, CASCADE nem
 * DEFAULT — e sobretudo não pega o erro mais comum de migration, que é a que
 * simplesmente não roda. Um CHECK escrito errado passa por toda a suíte unitária
 * e só aparece em produção, no primeiro INSERT que ele deveria ter recusado.
 *
 * Aqui cada garantia da migration é exercitada pelo próprio PostgreSQL.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-requests-schema.integration.test.js
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
const dbName = `salereqschema_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}

function makeDatabaseUrl(name) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function runMigrations(dbUrl) {
  const entryPath = path.join(workspaceRoot, "scripts/run-migrations.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        TEST_DATABASE_URL: dbUrl,
        NODE_ENV: "test",
        RUN_WORKERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`migrations falharam (${code}).\n${output}`))
    );
  });
}

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_images, sale_requests, users, cities RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );
  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@schema.test', 'x', 'Dono', 'cpf') RETURNING id`
  );

  return { cityId: cityRows[0].id, ownerId: ownerRows[0].id };
}

let world;

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await adminPool
    .query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    )
    .catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`).catch(() => {});
  await adminPool.end().catch(() => {});
});

/** INSERT mínimo válido; `overrides` troca colunas para exercitar cada CHECK. */
async function insertRequest(overrides = {}) {
  const row = {
    owner_user_id: world.ownerId,
    city_id: world.cityId,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: null,
    fipe_reference_value: null,
    fipe_reference_at: null,
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...overrides,
  };

  const { rows } = await pool.query(
    `INSERT INTO sale_requests (
       owner_user_id, city_id, brand, brand_slug, model, model_slug,
       fipe_model_description, fipe_code, fipe_reference_value, fipe_reference_at,
       year, mileage, transmission, fuel_type, declared_condition, known_issues
       ${overrides.status !== undefined ? ", status" : ""}
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
       ${overrides.status !== undefined ? ", $17" : ""})
     RETURNING id, status, created_at, updated_at`,
    [
      row.owner_user_id,
      row.city_id,
      row.brand,
      row.brand_slug,
      row.model,
      row.model_slug,
      row.fipe_model_description,
      row.fipe_code,
      row.fipe_reference_value,
      row.fipe_reference_at,
      row.year,
      row.mileage,
      row.transmission,
      row.fuel_type,
      row.declared_condition,
      row.known_issues,
      ...(overrides.status !== undefined ? [row.status] : []),
    ]
  );

  return rows[0];
}

describe.sequential("migration 052 — sale_requests", () => {
  it("a tabela existe com as colunas previstas e SEM as proibidas", async () => {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_requests'`
    );
    const byName = new Map(rows.map((row) => [row.column_name, row]));

    for (const column of [
      "id",
      "owner_user_id",
      "city_id",
      "brand",
      "brand_slug",
      "model",
      "model_slug",
      "fipe_model_description",
      "fipe_code",
      "fipe_reference_value",
      "fipe_reference_at",
      "year",
      "mileage",
      "transmission",
      "fuel_type",
      "declared_condition",
      "known_issues",
      "status",
      "created_at",
      "updated_at",
    ]) {
      expect(byName.has(column), `coluna ausente: ${column}`).toBe(true);
    }

    // O que a Fase 4.1 decidiu NÃO criar. `plate` é o item de LGPD (§17);
    // os outros são estado que ainda não tem quem escreva.
    for (const forbidden of [
      "plate",
      "plate_hash",
      "expires_at",
      "current_highest_bid",
      "selected_bid_id",
    ]) {
      expect(byName.has(forbidden), `coluna proibida presente: ${forbidden}`).toBe(false);
    }

    // Obrigatoriedade que o produto depende: sem cidade não há distribuição.
    expect(byName.get("city_id").is_nullable).toBe("NO");
    expect(byName.get("owner_user_id").is_nullable).toBe("NO");
    expect(byName.get("fipe_model_description").is_nullable).toBe("NO");
    // FIPE é âncora opcional — nunca inventada.
    expect(byName.get("fipe_reference_value").is_nullable).toBe("YES");
    expect(byName.get("known_issues").is_nullable).toBe("YES");
  });

  it("nasce em receiving_offers por DEFAULT", async () => {
    const row = await insertRequest();
    expect(row.status).toBe("receiving_offers");
  });

  it("aceita apenas os DOIS status desta fase", async () => {
    await expect(insertRequest({ status: "cancelled" })).resolves.toBeTruthy();

    // Estado sem writer não existe: `selected` e `completed` entram nas fases
    // 4.4/4.5, com migration própria.
    for (const status of ["selected", "completed", "receiving", "qualquer"]) {
      await expect(insertRequest({ status })).rejects.toThrow(/sale_requests_status_check/);
    }
  });

  it("CHECK de ano recusa fora da faixa", async () => {
    await expect(insertRequest({ year: 1949 })).rejects.toThrow(/sale_requests_year_check/);
    await expect(insertRequest({ year: 2101 })).rejects.toThrow(/sale_requests_year_check/);
    await expect(insertRequest({ year: 1950 })).resolves.toBeTruthy();
  });

  it("CHECK de quilometragem aceita zero e recusa negativo", async () => {
    await expect(insertRequest({ mileage: 0 })).resolves.toBeTruthy();
    await expect(insertRequest({ mileage: -1 })).rejects.toThrow(/sale_requests_mileage_check/);
  });

  it("CHECK de condição recusa valor fora do vocabulário", async () => {
    for (const condition of ["excelente", "bom", "regular", "precisa_reparos"]) {
      await expect(insertRequest({ declared_condition: condition })).resolves.toBeTruthy();
    }
    await expect(insertRequest({ declared_condition: "ótimo" })).rejects.toThrow(
      /declared_condition_check/
    );
  });

  it("CHECK de valor FIPE aceita NULL mas recusa zero e negativo", async () => {
    // NULL = "não resolvida". Zero seria "resolvida como nada" — dado errado
    // disfarçado de dado.
    await expect(insertRequest({ fipe_reference_value: null })).resolves.toBeTruthy();
    await expect(insertRequest({ fipe_reference_value: "1.00" })).resolves.toBeTruthy();
    await expect(insertRequest({ fipe_reference_value: "0.00" })).rejects.toThrow(
      /fipe_reference_value_check/
    );
    await expect(insertRequest({ fipe_reference_value: "-1.00" })).rejects.toThrow(
      /fipe_reference_value_check/
    );
  });

  it("FK do dono existe e faz CASCADE", async () => {
    await expect(insertRequest({ owner_user_id: 999999 })).rejects.toThrow(
      /violates foreign key constraint/
    );

    await insertRequest();
    await pool.query(`DELETE FROM users WHERE id = $1`, [world.ownerId]);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM sale_requests`);
    expect(rows[0].n).toBe(0);
  });

  it("FK da cidade existe e RECUSA a remoção do catálogo", async () => {
    await expect(insertRequest({ city_id: 999999 })).rejects.toThrow(
      /violates foreign key constraint/
    );

    await insertRequest();

    // Sem ON DELETE: apagar cidade em uso é recusado pelo banco. CASCADE
    // destruiria solicitações de gente real por uma limpeza de catálogo.
    await expect(pool.query(`DELETE FROM cities WHERE id = $1`, [world.cityId])).rejects.toThrow(
      /violates foreign key constraint/
    );
  });

  it("os dois índices previstos existem, e o da cidade é PARCIAL", async () => {
    const { rows } = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'sale_requests'`
    );
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));

    expect(byName.has("sale_requests_owner_created_idx")).toBe(true);
    expect(byName.has("sale_requests_city_open_idx")).toBe(true);
    // Parcial: solicitação cancelada nunca aparece para lojista, então não
    // precisa ocupar o índice que a Fase 4.2 vai usar.
    expect(byName.get("sale_requests_city_open_idx")).toMatch(/WHERE \(?status = 'receiving_offers'/);
  });
});

describe.sequential("migration 053 — sale_request_images", () => {
  it("a tabela existe SEM image_url e SEM is_cover", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sale_request_images'`
    );
    const names = new Set(rows.map((row) => row.column_name));

    expect(names.has("storage_key")).toBe(true);
    expect(names.has("sort_order")).toBe(true);

    // Um fato, uma coluna: a URL é derivada e a capa é sort_order 0.
    expect(names.has("image_url")).toBe(false);
    expect(names.has("is_cover")).toBe(false);
  });

  it("storage_key é UNIQUE GLOBAL — não apenas por solicitação", async () => {
    const a = await insertRequest();
    const b = await insertRequest();
    const key = "sale-requests/1/sess/2026/08/uuid-0.webp";

    await pool.query(
      `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,0)`,
      [a.id, key]
    );

    // A MESMA chave numa OUTRA solicitação precisa falhar. Com um UNIQUE
    // composto (sale_request_id, storage_key) isto passaria — e o mesmo objeto
    // do R2 pertenceria a duas solicitações, possivelmente de donos diferentes.
    await expect(
      pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,0)`,
        [b.id, key]
      )
    ).rejects.toThrow(/sale_request_images_storage_key_key/);
  });

  it("CASCADE apaga a galeria junto com a solicitação", async () => {
    const request = await insertRequest();
    for (let i = 0; i < 4; i += 1) {
      await pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,$3)`,
        [request.id, `sale-requests/1/sess/2026/08/uuid-${i}.webp`, i]
      );
    }

    await pool.query(`DELETE FROM sale_requests WHERE id = $1`, [request.id]);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM sale_request_images`);
    expect(rows[0].n).toBe(0);
  });

  it("CHECK recusa sort_order negativo", async () => {
    const request = await insertRequest();
    await expect(
      pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES ($1,$2,-1)`,
        [request.id, "sale-requests/1/sess/2026/08/neg.webp"]
      )
    ).rejects.toThrow(/sort_order_check/);
  });

  it("FK recusa solicitação inexistente", async () => {
    await expect(
      pool.query(
        `INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order) VALUES (999999,'k',0)`
      )
    ).rejects.toThrow(/violates foreign key constraint/);
  });
});

describe.sequential("isolamento — o Produto 2 não toca o Produto 1 nem os anúncios", () => {
  it("nenhuma coluna nova apareceu em ads, users ou advertisers", async () => {
    // A Fase 4.1 não podia alterar essas tabelas (§40 da especificação). Se
    // alguém adicionar `ALTER TABLE ads` numa migration da fase, este teste cai.
    for (const [table, forbidden] of [
      ["ads", ["sale_request_id", "plate"]],
      ["users", ["sale_request_count"]],
      ["advertisers", ["sale_request_id"]],
    ]) {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]
      );
      const names = new Set(rows.map((row) => row.column_name));
      for (const column of forbidden) {
        expect(names.has(column), `${table}.${column} não deveria existir`).toBe(false);
      }
    }
  });

  it("o CHECK de ads.status continua com os 6 valores canônicos", async () => {
    // Reutilizar `ads` foi rejeitado justamente para não mexer aqui.
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'ads_status_check'`
    );
    expect(rows).toHaveLength(1);
    for (const status of ["active", "pending_review", "paused", "rejected", "blocked", "deleted"]) {
      expect(rows[0].def).toContain(status);
    }
    expect(rows[0].def).not.toContain("sale_request");
  });

  it("não existe tabela de lances nem de oferta final nesta fase", async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'sale_request%'`
    );
    const names = new Set(rows.map((row) => row.table_name));

    expect(names).toEqual(new Set(["sale_requests", "sale_request_images"]));
  });
});
