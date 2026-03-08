import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function hasMigration(client, id) {
  const result = await client.query(
    `SELECT 1 FROM schema_migrations WHERE id = $1 LIMIT 1`,
    [id]
  );

  return result.rowCount > 0;
}

async function runSingleMigration(client, filename) {
  const migrationId = filename.replace(/\.sql$/i, "");
  const alreadyExecuted = await hasMigration(client, migrationId);

  if (alreadyExecuted) {
    logger.info({ migrationId }, "[migrate] migration já aplicada");
    return;
  }

  const absolutePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(absolutePath, "utf8");

  logger.info({ migrationId }, "[migrate] aplicando migration");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (id, executed_at) VALUES ($1, NOW())`,
      [migrationId]
    );
    await client.query("COMMIT");

    logger.info({ migrationId }, "[migrate] migration aplicada com sucesso");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(
      {
        migrationId,
        error: error?.message || String(error),
      },
      "[migrate] falha ao aplicar migration"
    );
    throw error;
  }
}

export default async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info("[migrate] iniciando migrations");
    await ensureMigrationsTable(client);

    const files = await listMigrationFiles();

    for (const filename of files) {
      await runSingleMigration(client, filename);
    }

    logger.info({ total: files.length }, "[migrate] migrations finalizadas");
  } finally {
    client.release();
  }
}
