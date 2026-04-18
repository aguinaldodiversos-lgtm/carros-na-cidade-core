import fs from "node:fs/promises";
import path from "node:path";
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
  await client
    .query(`SELECT pg_advisory_unlock(hashtext($1))`, [MIGRATIONS_LOCK_KEY])
    .catch(() => {});
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

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

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
    logger.info({ migrationId, filename }, "[migrate] migration já aplicada");
    return;
  }

  const absolutePath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(absolutePath, "utf8");

  logger.info({ migrationId, filename }, "[migrate] aplicando migration");

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
  }
}

export default async function runMigrations() {
  const client = await pool.connect();

  try {
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
    client.release();
  }
}
