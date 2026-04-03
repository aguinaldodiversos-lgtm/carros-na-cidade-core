import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const MIGRATIONS_SCHEMA = "public";
const MIGRATIONS_TABLE = "schema_migrations";
const MIGRATIONS_LOCK_KEY = 82456123;

function buildQualifiedTableName(schema, table) {
  return `${schema}.${table}`;
}

function toMigrationId(filename) {
  return filename.replace(/\.sql$/i, "");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function tableExists(client, tableName, schema = MIGRATIONS_SCHEMA) {
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

async function getTableColumns(client, tableName, schema = MIGRATIONS_SCHEMA) {
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
  const qualifiedTable = buildQualifiedTableName(MIGRATIONS_SCHEMA, MIGRATIONS_TABLE);
  const exists = await tableExists(client, MIGRATIONS_TABLE);

  if (!exists) {
    await client.query(`
      CREATE TABLE ${qualifiedTable} (
        id BIGSERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        checksum TEXT,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    logger.info("[migrate] tabela schema_migrations criada");
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
      ALTER TABLE ${qualifiedTable}
      ADD COLUMN filename TEXT
    `);

    await client.query(`
      UPDATE ${qualifiedTable}
      SET filename = id
      WHERE filename IS NULL
    `);

    await client.query(`
      ALTER TABLE ${qualifiedTable}
      ALTER COLUMN filename SET NOT NULL
    `);

    logger.warn(
      "[migrate] schema_migrations legado detectado; filename criado e preenchido a partir de id TEXT"
    );
  } else if (!hasFilename) {
    await client.query(`
      ALTER TABLE ${qualifiedTable}
      ADD COLUMN IF NOT EXISTS filename TEXT
    `);

    logger.warn(
      "[migrate] schema_migrations sem coluna filename; coluna criada. Verifique registros antigos."
    );
  }

  if (!hasChecksum) {
    await client.query(`
      ALTER TABLE ${qualifiedTable}
      ADD COLUMN IF NOT EXISTS checksum TEXT
    `);
  }

  if (!hasExecutedAt) {
    await client.query(`
      ALTER TABLE ${qualifiedTable}
      ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_uidx
    ON ${qualifiedTable} (filename)
  `);
}

async function listMigrationFiles() {
  const dirExists = await pathExists(MIGRATIONS_DIR);

  if (!dirExists) {
    throw new Error(`Diretório de migrations não encontrado: ${MIGRATIONS_DIR}`);
  }

  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

async function getExecutedMigrations(client) {
  const qualifiedTable = buildQualifiedTableName(MIGRATIONS_SCHEMA, MIGRATIONS_TABLE);

  const result = await client.query(`
    SELECT filename, checksum, executed_at
    FROM ${qualifiedTable}
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

async function backfillChecksumIfMissing(client, filename, checksum) {
  const qualifiedTable = buildQualifiedTableName(MIGRATIONS_SCHEMA, MIGRATIONS_TABLE);

  await client.query(
    `
      UPDATE ${qualifiedTable}
      SET checksum = $2
      WHERE filename = $1
        AND checksum IS NULL
    `,
    [filename, checksum]
  );
}

async function recordMigration(client, filename, checksum) {
  const qualifiedTable = buildQualifiedTableName(MIGRATIONS_SCHEMA, MIGRATIONS_TABLE);

  await client.query(
    `
      INSERT INTO ${qualifiedTable} (filename, checksum, executed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (filename) DO NOTHING
    `,
    [filename, checksum]
  );
}

async function readMigration(filename) {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(fullPath, "utf8");

  const normalized = sql.trimStart();
  const transactional = !normalized.startsWith("-- migrate: no-transaction");

  return {
    filename,
    migrationId: toMigrationId(filename),
    sql,
    checksum: sha256(sql),
    transactional,
  };
}

async function runSingleMigration(client, migration, executedMigrations) {
  const { filename, migrationId, sql, checksum, transactional } = migration;
  const existing = executedMigrations.get(filename);

  if (existing) {
    if (existing.checksum && existing.checksum !== checksum) {
      throw new Error(
        `Migration já aplicada com conteúdo diferente: ${filename}. ` +
          "Não altere migrations antigas; crie uma nova migration."
      );
    }

    if (!existing.checksum) {
      await backfillChecksumIfMissing(client, filename, checksum);
    }

    logger.info({ migrationId, filename }, "[migrate] migration já aplicada");
    return;
  }

  logger.info({ migrationId, filename, transactional }, "[migrate] aplicando migration");

  if (transactional) {
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await recordMigration(client, filename, checksum);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error(
        {
          migrationId,
          filename,
          error: error?.message || String(error),
        },
        "[migrate] falha ao aplicar migration"
      );
      throw error;
    }
  } else {
    try {
      await client.query(sql);
      await recordMigration(client, filename, checksum);
    } catch (error) {
      logger.error(
        {
          migrationId,
          filename,
          error: error?.message || String(error),
        },
        "[migrate] falha ao aplicar migration sem transação"
      );
      throw error;
    }
  }

  logger.info({ migrationId, filename }, "[migrate] migration aplicada com sucesso");
}

export default async function runMigrations() {
  const client = await pool.connect();

  try {
    logger.info({ migrationsDir: MIGRATIONS_DIR }, "[migrate] iniciando migrations");

    await client.query("SELECT pg_advisory_lock($1)", [MIGRATIONS_LOCK_KEY]);

    await ensureMigrationsTable(client);

    const files = await listMigrationFiles();
    const executedMigrations = await getExecutedMigrations(client);

    for (const filename of files) {
      const migration = await readMigration(filename);
      await runSingleMigration(client, migration, executedMigrations);
      executedMigrations.set(filename, {
        checksum: migration.checksum,
        executedAt: new Date(),
      });
    }

    logger.info(
      {
        totalFiles: files.length,
        totalExecutedKnown: executedMigrations.size,
      },
      "[migrate] migrations finalizadas"
    );
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATIONS_LOCK_KEY]);
    } catch {
      // evita mascarar erro principal
    }

    client.release();
  }
}
