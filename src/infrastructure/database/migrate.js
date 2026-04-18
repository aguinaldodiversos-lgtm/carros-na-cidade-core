import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { logger } from "../../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATIONS_LOCK_KEY = 82456123;

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

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
  const exists = await tableExists(client, MIGRATIONS_TABLE);

  if (!exists) {
    await client.query(`
      CREATE TABLE public.${MIGRATIONS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    logger.info("[db.migrate] tabela schema_migrations criada");
    return;
  }

  const columns = await getTableColumns(client, MIGRATIONS_TABLE);
  const hasId = columns.has("id");
  const hasFilename = columns.has("filename");
  const hasChecksum = columns.has("checksum");
  const hasExecutedAt = columns.has("executed_at");
  const idType = columns.get("id");

  // Compatibilidade com schema legado:
  // CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, executed_at TIMESTAMP ...)
  if (!hasFilename && hasId && idType === "text") {
    await client.query(`
      ALTER TABLE public.${MIGRATIONS_TABLE}
      ADD COLUMN filename TEXT
    `);

    await client.query(`
      UPDATE public.${MIGRATIONS_TABLE}
      SET filename = id
      WHERE filename IS NULL
    `);

    await client.query(`
      ALTER TABLE public.${MIGRATIONS_TABLE}
      ALTER COLUMN filename SET NOT NULL
    `);

    logger.warn(
      "[db.migrate] schema legado detectado; filename foi criado e preenchido a partir de id TEXT"
    );
  } else if (!hasFilename) {
    await client.query(`
      ALTER TABLE public.${MIGRATIONS_TABLE}
      ADD COLUMN IF NOT EXISTS filename TEXT
    `);

    logger.warn(
      "[db.migrate] schema_migrations sem coluna filename; coluna criada. Verifique registros antigos se necessário."
    );
  }

  if (!hasChecksum) {
    await client.query(`
      ALTER TABLE public.${MIGRATIONS_TABLE}
      ADD COLUMN IF NOT EXISTS checksum TEXT
    `);
  }

  if (!hasExecutedAt) {
    await client.query(`
      ALTER TABLE public.${MIGRATIONS_TABLE}
      ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_uidx
    ON public.${MIGRATIONS_TABLE}(filename)
  `);
}

async function getExecutedMigrations(client) {
  const result = await client.query(`
    SELECT filename, checksum, executed_at
    FROM public.${MIGRATIONS_TABLE}
    ORDER BY filename ASC
  `);

  return new Map(
    result.rows.map((row) => [
      row.filename,
      {
        checksum: row.checksum ?? null,
        executedAt: row.executed_at ?? null,
      },
    ])
  );
}

async function getMigrationFiles() {
  let entries;

  try {
    entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  } catch (error) {
    logger.error(
      {
        migrationsDir: MIGRATIONS_DIR,
        error: error?.message || String(error),
      },
      "[db.migrate] não foi possível listar o diretório de migrations"
    );
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function readMigrationFile(filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(fullPath, "utf8");

  const normalized = sql.trimStart();
  const transactional = !normalized.startsWith("-- migrate: no-transaction");
  const checksum = sha256(sql);

  return {
    filename,
    fullPath,
    sql,
    checksum,
    transactional,
  };
}

async function recordMigration(client, filename, checksum) {
  await client.query(
    `
      INSERT INTO public.${MIGRATIONS_TABLE} (filename, checksum, executed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (filename) DO NOTHING
    `,
    [filename, checksum]
  );
}

async function backfillChecksumIfMissing(client, filename, checksum) {
  await client.query(
    `
      UPDATE public.${MIGRATIONS_TABLE}
      SET checksum = $2
      WHERE filename = $1
        AND checksum IS NULL
    `,
    [filename, checksum]
  );
}

async function runSingleMigration(client, migration, executedMigrations) {
  const existing = executedMigrations.get(migration.filename);

  if (existing) {
    if (existing.checksum && existing.checksum !== migration.checksum) {
      throw new Error(
        `Migration já aplicada com conteúdo diferente: ${migration.filename}. ` +
          `Não altere migrations históricas; crie uma nova migration.`
      );
    }

    if (!existing.checksum) {
      await backfillChecksumIfMissing(client, migration.filename, migration.checksum);
    }

    logger.info({ file: migration.filename }, "[db.migrate] migration já aplicada");
    return;
  }

  logger.info(
    {
      file: migration.filename,
      transactional: migration.transactional,
    },
    "[db.migrate] aplicando migration"
  );

  if (migration.transactional) {
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await recordMigration(client, migration.filename, migration.checksum);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } else {
    await client.query(migration.sql);
    await recordMigration(client, migration.filename, migration.checksum);
  }

  logger.info({ file: migration.filename }, "[db.migrate] migration aplicada com sucesso");
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info(
      {
        migrationsDir: MIGRATIONS_DIR,
      },
      "[db.migrate] iniciando migrations"
    );

    await client.query("SELECT pg_advisory_lock($1)", [MIGRATIONS_LOCK_KEY]);

    await ensureMigrationsTable(client);

    const executedMigrations = await getExecutedMigrations(client);
    const files = await getMigrationFiles();

    for (const file of files) {
      const migration = await readMigrationFile(file);
      await runSingleMigration(client, migration, executedMigrations);
      executedMigrations.set(migration.filename, {
        checksum: migration.checksum,
        executedAt: new Date(),
      });
    }

    logger.info(
      {
        totalFiles: files.length,
        alreadyExecuted: [...executedMigrations.keys()].length,
      },
      "[db.migrate] todas as migrations concluídas"
    );
  } catch (error) {
    logger.error(
      {
        error: error?.message || String(error),
        stack: error?.stack,
      },
      "[db.migrate] erro ao aplicar migrations"
    );
    throw error;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATIONS_LOCK_KEY]);
    } catch {
      // não sobrescrever erro principal
    }

    client.release();
  }
}

import runMigrationsLegacy from "../../database/migrate.js";

export default runMigrationsLegacy;
