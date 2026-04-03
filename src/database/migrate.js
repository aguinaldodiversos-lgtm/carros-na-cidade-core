import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Chave arbitrária e estável para evitar corrida entre boots concorrentes
const MIGRATIONS_LOCK_KEY = 82456123;

async function tableExists(client, tableName, schema = "public") {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
      LIMIT 1
    `,
    [schema, tableName]
  );

  return result.rowCount > 0;
}

async function getTableColumns(client, tableName, schema = "public") {
  const result = await client.query(
    `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, tableName]
  );

  return new Map(result.rows.map((row) => [row.column_name, row.data_type]));
}

async function ensureMigrationsTable(client) {
  const exists = await tableExists(client, "schema_migrations");

  if (!exists) {
    await client.query(`
      CREATE TABLE public.schema_migrations (
        id BIGSERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    logger.info("[migrate] tabela schema_migrations criada");
    return;
  }

  const columns = await getTableColumns(client, "schema_migrations");
  const hasId = columns.has("id");
  const hasFilename = columns.has("filename");
  const idType = columns.get("id");

  // Caso legado: tabela criada com `id TEXT PRIMARY KEY, executed_at ...`
  if (!hasFilename && hasId && idType === "text") {
    await client.query(`
      ALTER TABLE public.schema_migrations
      ADD COLUMN filename TEXT
    `);

    await client.query(`
      UPDATE public.schema_migrations
      SET filename = id
      WHERE filename IS NULL
    `);

    await client.query(`
      ALTER TABLE public.schema_migrations
      ALTER COLUMN filename SET NOT NULL
    `);

    logger.warn(
      "[migrate] schema_migrations legado detectado; coluna filename criada e preenchida a partir de id TEXT"
    );
  }

  // Caso estranho: tabela existe sem filename e sem legado compatível
  if (!hasFilename && !(hasId && idType === "text")) {
    await client.query(`
      ALTER TABLE public.schema_migrations
      ADD COLUMN IF NOT EXISTS filename TEXT
    `);

    logger.warn(
      "[migrate] schema_migrations sem coluna filename; coluna adicionada. Verifique registros antigos."
    );
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_uidx
    ON public.schema_migrations (filename)
  `);

  // Garante executed_at para tabelas antigas incompletas
  await client.query(`
    ALTER TABLE public.schema_migrations
    ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function hasMigration(client, filename) {
  const result = await client.query(
    `
      SELECT 1
      FROM public.schema_migrations
      WHERE filename = $1
      LIMIT 1
    `,
    [filename]
  );

  return result.rowCount > 0;
}

async function recordMigration(client, filename) {
  await client.query(
    `
      INSERT INTO public.schema_migrations (filename, executed_at)
      VALUES ($1, NOW())
      ON CONFLICT (filename) DO NOTHING
    `,
    [filename]
  );
}

async function runSingleMigration(client, filename) {
  const alreadyExecuted = await hasMigration(client, filename);

  if (alreadyExecuted) {
    logger.info({ filename }, "[migrate] migration já aplicada");
    return;
  }

  const absolutePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(absolutePath, "utf8");

  logger.info({ filename }, "[migrate] aplicando migration");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await recordMigration(client, filename);
    await client.query("COMMIT");

    logger.info({ filename }, "[migrate] migration aplicada com sucesso");
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(
      {
        filename,
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

    await client.query("SELECT pg_advisory_lock($1)", [MIGRATIONS_LOCK_KEY]);

    await ensureMigrationsTable(client);

    const files = await listMigrationFiles();

    for (const filename of files) {
      await runSingleMigration(client, filename);
    }

    logger.info({ total: files.length }, "[migrate] migrations finalizadas");
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATIONS_LOCK_KEY]);
    } catch {
      // evita mascarar erro principal
    }
    client.release();
  }
}
