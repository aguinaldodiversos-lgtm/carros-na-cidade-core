#!/usr/bin/env node
/**
 * Diagnóstico read-only de public.request_audit_logs.
 *
 * Mostra:
 *   - tamanho total / heap / índices / linhas
 *   - top paths por contagem
 *   - top user-agents por contagem
 *   - distribuição por status code
 *   - distribuição por dia (últimos 14 dias)
 *
 * IMPORTANTE: rode ANTES do TRUNCATE de emergência pra ter o
 * mapeamento de quem estava poluindo (provavelmente bots/health probes).
 *
 * Uso:
 *   node scripts/maintenance/diagnose-request-audit-logs.mjs
 *   node scripts/maintenance/diagnose-request-audit-logs.mjs --limit=50
 */

import "../../src/infrastructure/database/_load-dotenv-optional.js";
import { query, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const args = process.argv.slice(2);
function flag(name, def) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return def;
  return hit.split("=")[1];
}

const LIMIT = Math.max(1, Math.min(200, Number(flag("limit", 20)) || 20));

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

async function printSizes() {
  const { rows } = await query(`
    SELECT
      pg_size_pretty(pg_total_relation_size('public.request_audit_logs')) AS total,
      pg_size_pretty(pg_relation_size('public.request_audit_logs'))       AS heap,
      pg_size_pretty(pg_indexes_size('public.request_audit_logs'))        AS indexes,
      (SELECT reltuples::bigint FROM pg_class
        WHERE oid = 'public.request_audit_logs'::regclass)                 AS rows_estimate
  `);
  const r = rows[0];
  console.log("\n# Tamanho");
  console.log(`  total       : ${r.total}`);
  console.log(`  heap        : ${r.heap}`);
  console.log(`  indexes     : ${r.indexes}`);
  console.log(`  rows (est.) : ${fmt(r.rows_estimate || 0)}`);
}

async function printTopPaths() {
  // Normalizamos paths trocando IDs numéricos por :id pra agrupar bem.
  const { rows } = await query(
    `
    SELECT
      regexp_replace(path, '/\\d+', '/:id', 'g') AS path_pattern,
      COUNT(*)::bigint AS hits
    FROM public.request_audit_logs
    GROUP BY 1
    ORDER BY hits DESC
    LIMIT $1
    `,
    [LIMIT]
  );
  console.log(`\n# Top ${LIMIT} paths (com IDs normalizados)`);
  for (const r of rows) {
    console.log(`  ${String(fmt(r.hits)).padStart(12)}  ${r.path_pattern}`);
  }
}

async function printTopUserAgents() {
  const { rows } = await query(
    `
    SELECT
      COALESCE(user_agent, '(null)') AS ua,
      COUNT(*)::bigint AS hits
    FROM public.request_audit_logs
    GROUP BY 1
    ORDER BY hits DESC
    LIMIT $1
    `,
    [LIMIT]
  );
  console.log(`\n# Top ${LIMIT} user-agents`);
  for (const r of rows) {
    const ua = r.ua.length > 100 ? r.ua.slice(0, 97) + "..." : r.ua;
    console.log(`  ${String(fmt(r.hits)).padStart(12)}  ${ua}`);
  }
}

async function printStatusDistribution() {
  const { rows } = await query(`
    SELECT
      CASE
        WHEN status_code BETWEEN 200 AND 299 THEN '2xx'
        WHEN status_code BETWEEN 300 AND 399 THEN '3xx'
        WHEN status_code BETWEEN 400 AND 499 THEN '4xx'
        WHEN status_code BETWEEN 500 AND 599 THEN '5xx'
        ELSE 'other'
      END AS bucket,
      COUNT(*)::bigint AS hits
    FROM public.request_audit_logs
    GROUP BY 1
    ORDER BY 1
  `);
  console.log("\n# Distribuição por status");
  for (const r of rows) {
    console.log(`  ${r.bucket}: ${fmt(r.hits)}`);
  }
}

async function printDaily() {
  const { rows } = await query(`
    SELECT
      date_trunc('day', created_at)::date AS day,
      COUNT(*)::bigint AS hits
    FROM public.request_audit_logs
    WHERE created_at >= NOW() - INTERVAL '14 days'
    GROUP BY 1
    ORDER BY 1 DESC
  `);
  console.log("\n# Volume diário (últimos 14 dias)");
  for (const r of rows) {
    console.log(`  ${r.day.toISOString().slice(0, 10)}  ${fmt(r.hits)}`);
  }
}

async function main() {
  console.log("=".repeat(72));
  console.log("diagnose-request-audit-logs (read-only)");
  console.log("=".repeat(72));
  await printSizes();
  await printStatusDistribution();
  await printDaily();
  await printTopPaths();
  await printTopUserAgents();
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
