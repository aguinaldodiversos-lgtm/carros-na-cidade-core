#!/usr/bin/env node
/**
 * Aguarda Postgres aceitar conexões (útil após `docker compose up -d`).
 * Uso: npm run integration:db:wait
 */
import pg from "pg";
import dotenv from "dotenv";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../tests/integration/helpers/integration-test-constants.js";

dotenv.config({ override: false });

const url =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const attempts = Number(process.env.INTEGRATION_PG_WAIT_ATTEMPTS || 45);
const delayMs = Number(process.env.INTEGRATION_PG_WAIT_MS || 1000);

const pool = new pg.Pool({ connectionString: url, max: 1 });

for (let i = 0; i < attempts; i += 1) {
  try {
    await pool.query("SELECT 1 AS ok");
    await pool.end();
    console.log("[wait-for-postgres] Conectado.");
    process.exit(0);
  } catch (err) {
    const msg = err?.message || String(err);
    console.log(
      `[wait-for-postgres] Tentativa ${i + 1}/${attempts}: ${msg.slice(0, 120)}`
    );
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

await pool.end().catch(() => {});
console.error("[wait-for-postgres] Timeout — Postgres não respondeu.");
process.exit(1);
