#!/usr/bin/env node
/**
 * Garante utilizador E2E (login fixo) + cidade Atibaia no Postgres.
 * Usar após migrations (`npm run integration:db:prepare`) com o mesmo DATABASE_URL / TEST_DATABASE_URL.
 *
 * Uso (raiz): node scripts/e2e-seed.mjs
 * Credenciais: cpf@carrosnacidade.com / 123456
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../.env.local"), override: true });

const DEFAULT_TEST_DB =
  "postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test";

const conn =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  DEFAULT_TEST_DB;

process.env.DATABASE_URL = conn;
process.env.TEST_DATABASE_URL = conn;
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const E2E_EMAIL = "cpf@carrosnacidade.com";
const E2E_PASSWORD = "123456";

const db = await import("../src/infrastructure/database/db.js");
const { pool, closeDatabasePool } = db;

const hash = await bcrypt.hash(E2E_PASSWORD, 10);

await pool.query(
  `
  INSERT INTO cities (name, state, slug)
  VALUES ('Atibaia', 'SP', 'atibaia-sp')
  ON CONFLICT (slug) DO NOTHING
  `
);

const updated = await pool.query(
  `
  UPDATE users
  SET password_hash = $2, email_verified = true, document_verified = true
  WHERE LOWER(email) = LOWER($1)
  RETURNING id
  `,
  [E2E_EMAIL, hash]
);

if (updated.rowCount === 0) {
  await pool.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      name,
      document_type,
      role,
      plan,
      email_verified,
      document_verified
    )
    VALUES ($1, $2, $3, 'cpf', 'user', 'free', true, true)
    `,
    [E2E_EMAIL, hash, "E2E CPF Demo"]
  );
}

const { rows } = await pool.query(
  "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
  [E2E_EMAIL]
);
const userId = rows[0]?.id != null ? String(rows[0].id) : null;
if (!userId) {
  throw new Error("[e2e-seed] Falha ao resolver id do utilizador E2E.");
}

const { ensureAdvertiserForUser } = await import(
  "../src/modules/advertisers/advertiser.ensure.service.js"
);
await ensureAdvertiserForUser(userId, { source: "e2e-seed" });

await pool.query(
  `DELETE FROM ads WHERE advertiser_id IN (
    SELECT id FROM advertisers WHERE user_id = $1::bigint
  )`,
  [userId]
);

await closeDatabasePool();

console.log("[e2e-seed] OK —", E2E_EMAIL, "+ cidade Atibaia + advertiser");
