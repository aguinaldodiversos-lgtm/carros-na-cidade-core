import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * A MIGRATION 056 contra PostgreSQL de verdade.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE SÓ O BANCO CONSEGUE PROVAR
 * ────────────────────────────────────────────────────────────────────────────
 * O fake-db é um array: ele não tem CHECK, não tem NUMERIC(14,2) e, sobretudo,
 * não pega o erro mais comum de migration — a que não roda. Um CHECK escrito
 * errado passa por toda a suíte unitária e só aparece em produção, no primeiro
 * INSERT que ele deveria ter recusado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OS DOIS CAMINHOS, E POR QUE O SEGUNDO É O QUE IMPORTA
 * ────────────────────────────────────────────────────────────────────────────
 * FRESCO (001 → 056) prova que a migration roda numa base nova.
 *
 * UPGRADE prova o que produção vai viver: uma tabela COM DADOS ganhando a
 * coluna. É onde um `NOT NULL` sem default derrubaria o deploy, e é onde um
 * default "esperto" (85% da FIPE, a maior proposta) atribuiria a pessoas reais
 * um piso que elas nunca declararam. O teste exige o contrário: a linha antiga
 * atravessa a migration com NULL, e NULL continua sendo NULL.
 *
 * O upgrade é simulado removendo a coluna e o CHECK de um banco já migrado e
 * reaplicando o ARQUIVO 056 — o mesmo SQL que o runner executaria, sobre uma
 * tabela com linha dentro.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/sale-request-minimum-price.integration.test.js
 */

dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const MIGRATION_PATH = path.join(
  workspaceRoot,
  "src/database/migrations/056_sale_request_minimum_accepted_price.sql"
);

const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `saleminprice_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

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

let world;

async function seedWorld() {
  await pool.query(
    `TRUNCATE sale_request_images, sale_requests, users, cities RESTART IDENTITY CASCADE`
  );

  const { rows: cityRows } = await pool.query(
    `INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp') RETURNING id`
  );
  const { rows: ownerRows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, document_type)
     VALUES ('owner@minprice.test', 'x', 'Dono', 'cpf') RETURNING id`
  );

  return { cityId: cityRows[0].id, ownerId: ownerRows[0].id };
}

/** INSERT mínimo válido. `minimum` ausente exercita o caminho da coluna NULL. */
async function insertRequest(minimum) {
  const columns = [
    "owner_user_id",
    "city_id",
    "brand",
    "brand_slug",
    "model",
    "model_slug",
    "fipe_model_description",
    "year",
    "mileage",
    "transmission",
    "fuel_type",
    "declared_condition",
  ];
  const values = [
    world.ownerId,
    world.cityId,
    "Volkswagen",
    "volkswagen",
    "T-Cross",
    "t-cross",
    "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    2020,
    45000,
    "automatico",
    "flex",
    "bom",
  ];

  if (minimum !== undefined) {
    columns.push("minimum_accepted_price");
    values.push(minimum);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  const { rows } = await pool.query(
    `INSERT INTO sale_requests (${columns.join(", ")})
     VALUES (${placeholders})
     RETURNING id, minimum_accepted_price::text AS minimum_accepted_price`,
    values
  );
  return rows[0];
}

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

// ============================================================================
describe.sequential("migration 056 — banco novo (001 → 056)", () => {
  it("a coluna existe, é NUMERIC(14,2) e é NULLABLE", async () => {
    const { rows } = await pool.query(
      `SELECT data_type, numeric_precision, numeric_scale, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'sale_requests' AND column_name = 'minimum_accepted_price'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("numeric");
    expect(Number(rows[0].numeric_precision)).toBe(14);
    expect(Number(rows[0].numeric_scale)).toBe(2);
    // NULLABLE é uma decisão sobre o LEGADO, não frouxidão: a obrigatoriedade
    // vive no código de criação, que é quem sabe distinguir "linha antiga" de
    // "campo esquecido no INSERT de hoje".
    expect(rows[0].is_nullable).toBe("YES");
  });

  it("o CHECK existe com o predicado esperado", async () => {
    const { rows } = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS definicao
       FROM pg_constraint
       WHERE conname = 'sale_requests_minimum_accepted_price_check'`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].definicao).toMatch(/minimum_accepted_price IS NULL/i);
    expect(rows[0].definicao).toMatch(/> \(?0/);
  });

  it("aceita NULL (linha legada) e valor positivo", async () => {
    const semPiso = await insertRequest(undefined);
    expect(semPiso.minimum_accepted_price).toBeNull();

    const comPiso = await insertRequest("62500.00");
    expect(comPiso.minimum_accepted_price).toBe("62500.00");
  });

  it("recusa ZERO — 'sem piso' não pode ser escrito como zero", async () => {
    await expect(insertRequest("0")).rejects.toMatchObject({ code: "23514" });
  });

  it("recusa valor negativo", async () => {
    await expect(insertRequest("-1.00")).rejects.toMatchObject({ code: "23514" });
  });

  it("guarda os centavos sem arredondar", async () => {
    const row = await insertRequest("62499.99");
    expect(row.minimum_accepted_price).toBe("62499.99");
  });

  it("um centavo é válido — o piso é positivo, não 'plausível'", async () => {
    // A sanidade comercial (`MONEY_MAX`, faixas) vive na aplicação, onde vira
    // mensagem de campo. O banco só garante o que é INEXPRIMÍVEL: não-positivo.
    const row = await insertRequest("0.01");
    expect(row.minimum_accepted_price).toBe("0.01");
  });
});

// ============================================================================
describe.sequential("migration 056 — upgrade com dados (055 → 056)", () => {
  /**
   * Volta o schema ao estado ANTERIOR à 056 e reaplica o arquivo real.
   *
   * É a simulação fiel do deploy: a tabela já tem linha, e a migration precisa
   * atravessar isso sem inventar valor nem falhar.
   */
  async function voltarPara055() {
    await pool.query(
      `ALTER TABLE sale_requests
         DROP CONSTRAINT IF EXISTS sale_requests_minimum_accepted_price_check`
    );
    await pool.query(`ALTER TABLE sale_requests DROP COLUMN IF EXISTS minimum_accepted_price`);
  }

  async function aplicar056() {
    await pool.query(fs.readFileSync(MIGRATION_PATH, "utf8"));
  }

  it("a linha publicada ANTES da migration sobrevive, e sobrevive com NULL", async () => {
    await voltarPara055();

    const { rows: antes } = await pool.query(
      `INSERT INTO sale_requests (
         owner_user_id, city_id, brand, brand_slug, model, model_slug,
         fipe_model_description, fipe_reference_value, year, mileage,
         transmission, fuel_type, declared_condition
       )
       VALUES ($1, $2, 'Fiat', 'fiat', 'Argo', 'argo', 'Argo Drive 1.0 6V Flex',
               75000.00, 2019, 60000, 'manual', 'flex', 'bom')
       RETURNING id`,
      [world.ownerId, world.cityId]
    );
    const legadoId = antes[0].id;

    await aplicar056();

    const { rows } = await pool.query(
      `SELECT minimum_accepted_price, fipe_reference_value::text AS fipe
       FROM sale_requests WHERE id = $1`,
      [legadoId]
    );

    // A linha continua lá, e o piso é NULL.
    expect(rows).toHaveLength(1);
    expect(rows[0].minimum_accepted_price).toBeNull();

    // E NENHUM valor econômico foi inventado a partir do que existia: os 85% da
    // FIPE (63.750) seriam o palpite mais tentador, e é exatamente o que não
    // pode acontecer — seria atribuir a uma pessoa real um piso que ela nunca
    // declarou, e passar a recusar propostas em nome dela.
    expect(rows[0].minimum_accepted_price).not.toBe("63750.00");
    expect(rows[0].fipe).toBe("75000.00");
  });

  it("reaplicar a migration é idempotente — coluna e CHECK não duplicam", async () => {
    await aplicar056();
    await aplicar056();

    const { rows: colunas } = await pool.query(
      `SELECT count(*)::int AS total FROM information_schema.columns
       WHERE table_name = 'sale_requests' AND column_name = 'minimum_accepted_price'`
    );
    const { rows: checks } = await pool.query(
      `SELECT count(*)::int AS total FROM pg_constraint
       WHERE conname = 'sale_requests_minimum_accepted_price_check'`
    );

    expect(colunas[0].total).toBe(1);
    expect(checks[0].total).toBe(1);
  });

  it("depois do upgrade, o CHECK vale para as linhas NOVAS", async () => {
    await aplicar056();
    await expect(insertRequest("0")).rejects.toMatchObject({ code: "23514" });
  });
});
