/**
 * Relatório read-only: anunciantes sem usuário (órfãos) e usuários sem anunciante.
 * Uso: node scripts/report-advertiser-integrity.mjs
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Defina DATABASE_URL no ambiente ou em .env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

try {
  const orphans = await pool.query(`
    SELECT a.id AS advertiser_id, a.user_id
    FROM advertisers a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE u.id IS NULL
    ORDER BY a.id
    LIMIT 100
  `);

  const missingAdvertiser = await pool.query(`
    SELECT u.id AS user_id, u.email
    FROM users u
    LEFT JOIN advertisers a ON a.user_id = u.id
    WHERE a.id IS NULL
    ORDER BY u.id
    LIMIT 100
  `);

  console.log("[integrity] Anunciantes sem usuário (órfãos):", orphans.rows.length);
  if (orphans.rows.length) {
    console.table(orphans.rows);
  }

  console.log("[integrity] Usuários sem linha em advertisers:", missingAdvertiser.rows.length);
  if (missingAdvertiser.rows.length) {
    console.table(missingAdvertiser.rows);
  }

  if (!orphans.rows.length && !missingAdvertiser.rows.length) {
    console.log("[integrity] OK — sem divergências nas primeiras verificações.");
  }
} catch (err) {
  console.error("[integrity] Erro:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
