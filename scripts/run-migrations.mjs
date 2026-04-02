#!/usr/bin/env node
/**
 * Aplica `src/database/migrations/*.sql` (registro em `schema_migrations`).
 * Use quando `RUN_MIGRATIONS=false` no boot ou para alinhar CI/staging antes do deploy.
 *
 * Uso (raiz): npm run db:migrate
 */
import "dotenv/config";
import runMigrations from "../src/database/migrate.js";
import { closeDatabasePool } from "../src/infrastructure/database/db.js";

try {
  await runMigrations();
  console.log("[db:migrate] OK");
} catch (err) {
  console.error("[db:migrate] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
