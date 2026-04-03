import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATIONS_LOCK_KEY = "carros-na-cidade:migrations";

function normalizeMigrationId(value) {
  return String(value || "")
    .trim()
    .replace(/\.sql$/i, "");
}

function normalizeMigrationFilename(value) {
  const migrationId = normalizeMigrationId(value);
  return migrationId ? `${migrationId}.sql` : null;
}

function isTextualColumn(column) {
  const dataType = String(column?.data_type || "").toLowerCase();
  const udtName = String(column?.udt_name || "").toLowerCase();
  return (
    dataType === "text" ||
    dataType === "character varying" ||
    dataType === "character" ||
    udtName === "text" ||
    udtName === "varchar" ||
    udtName === "bpchar"
  );
}

async function acquireMigrationLock(client) {
  await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [MIGRATIONS_LOCK_KEY]);
}

async function releaseMigrationLock(client) {
  await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [MIGRATIONS_LOCK_KEY]).catch(() => {});
}

async function getMigrationsTableProfile(client) {
  const result = await client.query(
    `
    SELECT
      column_name,
      data_type,
      udt_name,
      column_default,
      is_identity
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'schema_migrations'
    ORDER BY ordinal_position ASC
    `
  );

  const columns = new Map(result.rows.map((row) => [row.column_name, row]));
  const idColumn = columns.get("id");

  return {
    hasId: columns.has("id"),
    hasFilename: columns.has("filename"),
    hasExecutedAt: columns.has("executed_at"),
    idIsTextual: isTextualColumn(idColumn),
    idHasGeneratedDefault:
      String(idColumn?.is_identity || "").toUpperCase() === "YES" ||
      String(idColumn?.column_default || "").trim() !== "",
  };
}

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
<<<<<<< HEAD
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
=======
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
>>>>>>> 265f923 (refatora fluxo de criacao de anuncio)
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

  let profile = await getMigrationsTableProfile(client);

  if (!profile.hasFilename) {
    await client.query(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS filename TEXT`);
  }

  if (!profile.hasExecutedAt) {
    await client.query(
      `ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
    );
  }

  profile = await getMigrationsTableProfile(client);

  if (profile.hasFilename && profile.hasId && profile.idIsTextual) {
    await client.query(`
      UPDATE schema_migrations
      SET filename = CASE
        WHEN id IS NULL OR BTRIM(id::text) = '' THEN filename
        WHEN RIGHT(BTRIM(id::text), 4) ILIKE '.sql' THEN BTRIM(id::text)
        ELSE BTRIM(id::text) || '.sql'
      END
      WHERE filename IS NULL OR BTRIM(filename) = '';
    `);
  }

  profile = await getMigrationsTableProfile(client);
  const dedupeCandidateSql = profile.hasFilename
    ? `COALESCE(NULLIF(BTRIM(filename), ''), ${
        profile.hasId && profile.idIsTextual
          ? `CASE
              WHEN id IS NULL OR BTRIM(id::text) = '' THEN NULL
              WHEN RIGHT(BTRIM(id::text), 4) ILIKE '.sql' THEN BTRIM(id::text)
              ELSE BTRIM(id::text) || '.sql'
            END`
          : "NULL"
      })`
    : profile.hasId && profile.idIsTextual
      ? `CASE
          WHEN id IS NULL OR BTRIM(id::text) = '' THEN NULL
          WHEN RIGHT(BTRIM(id::text), 4) ILIKE '.sql' THEN BTRIM(id::text)
          ELSE BTRIM(id::text) || '.sql'
        END`
      : null;

  if (dedupeCandidateSql) {
    await client.query(`
      WITH normalized AS (
        SELECT
          ctid,
          ${dedupeCandidateSql} AS canonical_filename,
          executed_at
        FROM schema_migrations
      ),
      ranked AS (
        SELECT
          ctid,
          ROW_NUMBER() OVER (
            PARTITION BY canonical_filename
            ORDER BY executed_at ASC NULLS LAST, ctid ASC
          ) AS row_num
        FROM normalized
        WHERE canonical_filename IS NOT NULL
      )
      DELETE FROM schema_migrations sm
      USING ranked
      WHERE sm.ctid = ranked.ctid
        AND ranked.row_num > 1;
    `);
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_filename_key
      ON schema_migrations (filename)
      WHERE filename IS NOT NULL;
  `);

  return getMigrationsTableProfile(client);
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

<<<<<<< HEAD
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

=======
async function getAppliedMigrationFilenames(client, profile) {
  const selectFields = [
    profile.hasFilename ? `filename` : `NULL::text AS filename`,
    profile.hasId ? `id::text AS legacy_id` : `NULL::text AS legacy_id`,
  ];
  const result = await client.query(`
    SELECT ${selectFields.join(", ")}
    FROM schema_migrations
    ORDER BY executed_at ASC NULLS LAST
  `);

  const applied = new Set();

  for (const row of result.rows) {
    const normalizedFilename = normalizeMigrationFilename(row.filename ?? row.legacy_id);
    if (normalizedFilename) {
      applied.add(normalizedFilename);
    }
  }

  return applied;
}

async function insertMigrationRecord(client, profile, filename) {
  const migrationId = normalizeMigrationId(filename);
  const columns = [];
  const values = [];
  const params = [];

  if (profile.hasId && profile.idIsTextual) {
    columns.push("id");
    values.push(migrationId);
    params.push(`$${values.length}`);
  }

  if (profile.hasFilename) {
    columns.push("filename");
    values.push(filename);
    params.push(`$${values.length}`);
  }

  if (profile.hasExecutedAt) {
    columns.push("executed_at");
    params.push("NOW()");
  }

  if (!columns.length) {
    throw new Error("Tabela schema_migrations incompatível: nenhuma coluna útil disponível.");
  }

  await client.query(
    `
    INSERT INTO schema_migrations (${columns.join(", ")})
    VALUES (${params.join(", ")})
    `,
    values
  );
}

async function runSingleMigration(client, profile, appliedMigrations, filename) {
  const migrationId = filename.replace(/\.sql$/i, "");
  const alreadyExecuted = appliedMigrations.has(filename);

  if (alreadyExecuted) {
>>>>>>> 265f923 (refatora fluxo de criacao de anuncio)
    logger.info({ migrationId, filename }, "[migrate] migration já aplicada");
    return;
  }

  logger.info({ migrationId, filename, transactional }, "[migrate] aplicando migration");

<<<<<<< HEAD
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
=======
  logger.info({ migrationId }, "[migrate] aplicando migration");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await insertMigrationRecord(client, profile, filename);
    await client.query("COMMIT");
    appliedMigrations.add(filename);

    logger.info({ migrationId, filename }, "[migrate] migration aplicada com sucesso");
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
>>>>>>> 265f923 (refatora fluxo de criacao de anuncio)
  }

  logger.info({ migrationId, filename }, "[migrate] migration aplicada com sucesso");
}

export default async function runMigrations() {
  const client = await pool.connect();

  try {
<<<<<<< HEAD
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

=======
    logger.info("[migrate] iniciando migrations");
    await acquireMigrationLock(client);
    logger.info("[migrate] lock de migrations adquirido");

    const profile = await ensureMigrationsTable(client);
    const appliedMigrations = await getAppliedMigrationFilenames(client, profile);

    const files = await listMigrationFiles();
    let appliedCount = 0;
    let skippedCount = 0;

    for (const filename of files) {
      if (appliedMigrations.has(filename)) {
        skippedCount += 1;
      } else {
        appliedCount += 1;
      }
      await runSingleMigration(client, profile, appliedMigrations, filename);
    }

    logger.info(
      { total: files.length, applied: appliedCount, skipped: skippedCount },
      "[migrate] migrations finalizadas"
    );
  } finally {
    await releaseMigrationLock(client);
>>>>>>> 265f923 (refatora fluxo de criacao de anuncio)
    client.release();
  }
}
