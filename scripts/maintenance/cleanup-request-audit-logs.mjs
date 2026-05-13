#!/usr/bin/env node
/**
 * Emergency cleanup de public.request_audit_logs.
 *
 * Incidente 2026-05-13: tabela com 53M linhas / 15 GB suspendeu o Postgres
 * do Render. Causa raiz e fix completo no middleware:
 *   src/shared/middlewares/httpLogger.middleware.js
 *
 * Default é DRY-RUN. Só executa TRUNCATE com `--yes`.
 *
 * Uso:
 *   # Diagnóstico antes (read-only):
 *   node scripts/maintenance/cleanup-request-audit-logs.mjs
 *
 *   # Executa TRUNCATE:
 *   node scripts/maintenance/cleanup-request-audit-logs.mjs --yes
 *
 * Equivalente SQL puro: scripts/maintenance/sql/cleanup-request-audit-logs-emergency.sql
 */

import "../../src/infrastructure/database/_load-dotenv-optional.js";
import { query, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--yes");

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

async function snapshotSizes() {
  const { rows } = await query(`
    SELECT
      pg_size_pretty(pg_total_relation_size('public.request_audit_logs')) AS total,
      pg_size_pretty(pg_relation_size('public.request_audit_logs'))       AS heap,
      pg_size_pretty(pg_indexes_size('public.request_audit_logs'))        AS indexes,
      (SELECT reltuples::bigint FROM pg_class
        WHERE oid = 'public.request_audit_logs'::regclass)                 AS rows_estimate
  `);
  return rows[0];
}

async function checkForeignKeys() {
  const { rows } = await query(`
    SELECT conname, conrelid::regclass::text AS referencing_table
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'public.request_audit_logs'::regclass
  `);
  return rows;
}

async function main() {
  console.log("=".repeat(72));
  console.log("cleanup-request-audit-logs");
  console.log("mode:", APPLY ? "APPLY (TRUNCATE)" : "DRY-RUN (read-only)");
  console.log("=".repeat(72));

  const before = await snapshotSizes();
  console.log("\nEstado atual:");
  console.log(`  total       : ${before.total}`);
  console.log(`  heap        : ${before.heap}`);
  console.log(`  indexes     : ${before.indexes}`);
  console.log(`  rows (est.) : ${fmt(before.rows_estimate || 0)}`);

  const fks = await checkForeignKeys();
  if (fks.length > 0) {
    console.error("\n[ABORT] Existem FKs apontando para request_audit_logs:");
    for (const fk of fks) console.error(`  - ${fk.conname} from ${fk.referencing_table}`);
    console.error("Revise antes de truncar. Não é seguro continuar.");
    process.exit(2);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN. Para executar:");
    console.log("  node scripts/maintenance/cleanup-request-audit-logs.mjs --yes");
    console.log("\nO comando executará: TRUNCATE TABLE public.request_audit_logs RESTART IDENTITY;");
    return;
  }

  console.log("\nExecutando TRUNCATE…");
  const t0 = Date.now();
  await query("TRUNCATE TABLE public.request_audit_logs RESTART IDENTITY");
  const elapsed = Date.now() - t0;
  console.log(`  ok em ${elapsed}ms`);

  const after = await snapshotSizes();
  console.log("\nEstado após TRUNCATE:");
  console.log(`  total       : ${after.total}`);
  console.log(`  heap        : ${after.heap}`);
  console.log(`  indexes     : ${after.indexes}`);
  console.log(`  rows (est.) : ${fmt(after.rows_estimate || 0)}`);

  console.log("\nDica: rode `VACUUM ANALYZE public.request_audit_logs;` se o");
  console.log("dashboard de storage do Render não atualizar em poucos minutos.");
}

main()
  .then(() => closeDatabasePool())
  .catch(async (err) => {
    console.error("[fatal]", err);
    try {
      await closeDatabasePool();
    } catch {
      // pool já estava fechado / sem conexão
    }
    process.exit(1);
  });
