import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const LOCK_KEY = 82456123;

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    `SELECT filename, checksum FROM schema_migrations ORDER BY filename`
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function applyMigration(client, filename, applied) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(filePath, "utf8");
  const checksum = sha256(sql);

  const existingChecksum = applied.get(filename);

  if (existingChecksum != null) {
    if (existingChecksum && existingChecksum !== checksum) {
      throw new Error(
        `Checksum divergente para ${filename}. Não altere migrações já aplicadas; crie uma nova.`
      );
    }
    if (!existingChecksum) {
      await client.query(
        `UPDATE schema_migrations SET checksum = $2 WHERE filename = $1 AND checksum IS NULL`,
        [filename, checksum]
      );
    }
    logger.info({ file: filename }, "[migrate] já aplicada");
    return;
  }

  logger.info({ file: filename }, "[migrate] aplicando");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum]
    );
    await client.query("COMMIT");
    applied.set(filename, checksum);
    logger.info({ file: filename }, "[migrate] aplicada com sucesso");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error({ file: filename, error: error?.message }, "[migrate] falha");
    throw error;
  }
}

export default async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info("[migrate] iniciando");
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

    await ensureTrackingTable(client);
    const applied = await getAppliedMigrations(client);
    const files = await listMigrationFiles();

    let count = 0;
    for (const file of files) {
      if (!applied.has(file)) count++;
      await applyMigration(client, file, applied);
    }

    logger.info(
      { total: files.length, applied: count, skipped: files.length - count },
      "[migrate] concluído"
    );
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
