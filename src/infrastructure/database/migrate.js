import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";
import { logger } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function getExecutedMigrations(client) {
  const result = await client.query(`
    SELECT filename
    FROM schema_migrations
    ORDER BY filename ASC
  `);

  return new Set(result.rows.map((row) => row.filename));
}

async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info("[db.migrate] Iniciando migrations");
    await ensureMigrationsTable(client);

    const executed = await getExecutedMigrations(client);
    const files = await getMigrationFiles();

    for (const file of files) {
      if (executed.has(file)) {
        logger.info({ file }, "[db.migrate] Migration já aplicada");
        continue;
      }

      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(fullPath, "utf8");

      logger.info({ file }, "[db.migrate] Aplicando migration");

      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`,
        [file]
      );
      await client.query("COMMIT");

      logger.info({ file }, "[db.migrate] Migration aplicada com sucesso");
    }

    logger.info("[db.migrate] Todas as migrations concluídas");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch { /* rollback já falhou, ignora */ }

    logger.error({ error }, "[db.migrate] Erro ao aplicar migrations");
    throw error;
  } finally {
    client.release();
  }
}

export default runMigrations;
