import dotenv from "dotenv";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

// B2: testa o repositório de verdade com PostgreSQL, não uma réplica da consulta.
// O teste cria um banco isolado, aplica migrations e o remove ao final.
// Recusa hosts remotos e bancos de origem que não sejam de teste.
dotenv.config({ override: false });

const filename = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(filename), "../..");
const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;
const baseUrl = new URL(baseDatabaseUrl);

if (
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname) ||
  !baseUrl.pathname.toLowerCase().includes("test")
) {
  throw new Error("B2 exige PostgreSQL local e DATABASE_URL apontando para banco de testes.");
}

const runTag = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
const databaseName = "saleaccess_" + runTag;
const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";
const isolatedUrl = new URL(baseDatabaseUrl);
isolatedUrl.pathname = "/" + databaseName;

function quoteDatabaseName(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Nome de banco inválido.");
  return '"' + name + '"';
}

function poolConfig(url) {
  return {
    connectionString: String(url),
    ssl: resolveSslConfig(String(url), process.env),
  };
}

async function migrate(url) {
  const script = path.join(workspaceRoot, "scripts/run-migrations.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: String(url),
        TEST_DATABASE_URL: String(url),
        NODE_ENV: "test",
        RUN_WORKERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk.toString()));
    child.stderr.on("data", (chunk) => (log += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Migrations B2 falharam: " + log))
    );
  });
}

const adminPool = new Pool(poolConfig(adminUrl));
await adminPool.query("CREATE DATABASE " + quoteDatabaseName(databaseName));
await migrate(isolatedUrl);

// O db.js inicializa o pool no import; a troca deve ocorrer ANTES do import.
process.env.DATABASE_URL = String(isolatedUrl);
process.env.TEST_DATABASE_URL = String(isolatedUrl);
process.env.NODE_ENV = "test";

const { getVisibleByIdForCity } = await import(
  "../../src/modules/sale-requests/sale-requests.dealer.repository.js"
);
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");
const pool = new Pool(poolConfig(isolatedUrl));

let world;

async function insertRequest(cityId, ownerId) {
  const { rows } = await pool.query(
    `INSERT INTO sale_requests (
      owner_user_id, city_id, brand, brand_slug, model, model_slug,
      fipe_model_description, year, mileage, transmission, fuel_type,
      declared_condition, minimum_accepted_price, status
    )
    VALUES ($1, $2, 'Volkswagen', 'volkswagen', 'T-Cross', 't-cross',
            'T-Cross 200 TSI 1.0 Flex 12V 5p Aut.', 2020, 45000, 'automatico',
            'flex', 'bom', '60000.00', 'receiving_offers')
    RETURNING id`,
    [ownerId, cityId]
  );
  const id = rows[0].id;
  const round = await pool.query(
    "INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price) VALUES ($1, 1, '60000.00') RETURNING id",
    [id]
  );
  return { id, roundId: round.rows[0].id };
}

async function seedWorld() {
  await pool.query(
    "TRUNCATE sale_request_offer_selections, sale_request_offers, sale_request_images, sale_requests, advertisers, users, cities RESTART IDENTITY CASCADE"
  );
  const { rows: cities } = await pool.query(
    "INSERT INTO cities (name, state, slug) VALUES ('Atibaia', 'SP', 'atibaia-sp'), ('Bragança Paulista', 'SP', 'braganca-paulista-sp') RETURNING id"
  );
  const { rows: owner } = await pool.query(
    "INSERT INTO users (email, password_hash, name, document_type) VALUES ('owner@access.test', 'x', 'Proprietário', 'cpf') RETURNING id"
  );
  const { rows: dealers } = await pool.query(
    "INSERT INTO users (email, password_hash, name, document_type) VALUES ('winner@access.test', 'x', 'Vencedora', 'cnpj'), ('loser@access.test', 'x', 'Concorrente', 'cnpj') RETURNING id"
  );
  const { rows: winner } = await pool.query(
    "INSERT INTO advertisers (user_id, name, slug, city_id, status) VALUES ($1, 'Loja A', 'loja-a-access', $2, 'active') RETURNING id",
    [dealers[0].id, cities[0].id]
  );
  const { rows: loser } = await pool.query(
    "INSERT INTO advertisers (user_id, name, slug, city_id, status) VALUES ($1, 'Loja B', 'loja-b-access', $2, 'active') RETURNING id",
    [dealers[1].id, cities[0].id]
  );
  const open = await insertRequest(cities[0].id, owner[0].id);
  const selected = await insertRequest(cities[0].id, owner[0].id);
  const { rows: offers } = await pool.query(
    "INSERT INTO sale_request_offers (sale_request_id, round_id, dealer_user_id, advertiser_id, amount) VALUES ($1, $2, $3, $4, '65000.00') RETURNING id",
    [selected.id, selected.roundId, dealers[0].id, winner[0].id]
  );
  await pool.query(
    "UPDATE sale_requests SET status = 'offer_selected', selected_offer_id = $2, selected_offer_at = NOW() WHERE id = $1",
    [selected.id, offers[0].id]
  );
  return {
    cityId: cities[0].id,
    otherCityId: cities[1].id,
    openId: open.id,
    selectedId: selected.id,
    winnerId: winner[0].id,
    loserId: loser[0].id,
  };
}

beforeEach(async () => {
  world = await seedWorld();
});

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool().catch(() => {});
  await adminPool.query("DROP DATABASE IF EXISTS " + quoteDatabaseName(databaseName) + " WITH (FORCE)");
  await adminPool.end().catch(() => {});
});

describe("B2: selectedOnly em PostgreSQL real", () => {
  it("permite a aberta no modo normal e a oculta no modo restrito", async () => {
    const normal = await getVisibleByIdForCity(world.openId, world.cityId, world.winnerId, {
      selectedOnly: false,
    });
    expect(String(normal?.id)).toBe(String(world.openId));
    const restricted = await getVisibleByIdForCity(
      world.openId,
      world.cityId,
      world.winnerId,
      { selectedOnly: true }
    );
    expect(restricted).toBeNull();
  });

  it("permite a ficha selecionada somente à loja vencedora em ambos os modos", async () => {
    for (const selectedOnly of [false, true]) {
      const winner = await getVisibleByIdForCity(
        world.selectedId,
        world.cityId,
        world.winnerId,
        { selectedOnly }
      );
      expect(String(winner?.id)).toBe(String(world.selectedId));

      const loser = await getVisibleByIdForCity(
        world.selectedId,
        world.cityId,
        world.loserId,
        { selectedOnly }
      );
      expect(loser).toBeNull();

      const foreignCity = await getVisibleByIdForCity(
        world.selectedId,
        world.otherCityId,
        world.winnerId,
        { selectedOnly }
      );
      expect(foreignCity).toBeNull();
    }
  });
});
