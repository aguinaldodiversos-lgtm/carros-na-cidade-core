#!/usr/bin/env node
/**
 * Aplica migrations e garante ao menos uma cidade para tests/integration/ads-pipeline.
 * Requer Postgres acessível (ex.: npm run integration:db:up).
 *
 * Uso: npm run integration:db:prepare
 */
import dotenv from "dotenv";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../tests/integration/helpers/integration-test-constants.js";

dotenv.config({ override: false });

const url =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

process.env.DATABASE_URL = url;
process.env.TEST_DATABASE_URL = url;
process.env.NODE_ENV = "test";

const runMigrations = (await import("../src/database/migrate.js")).default;
await runMigrations();

const db = await import("../src/infrastructure/database/db.js");
const pool = db.default;
const { closeDatabasePool } = db;

try {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM cities"
  );
  if (rows[0]?.c === 0) {
    await pool.query(
      `
      INSERT INTO cities (name, state, slug)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug) DO NOTHING
      `,
      ["Test City (integration)", "SP", "test-city-sp-integration"]
    );
    console.log("[integration-db-prepare] Inserida cidade mínima para testes.");
  }
} finally {
  await closeDatabasePool();
}

console.log("[integration-db-prepare] OK");
process.exit(0);
