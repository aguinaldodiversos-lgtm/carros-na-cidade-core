#!/usr/bin/env node
/**
 * Retention job para public.request_audit_logs.
 *
 * Apaga em lotes linhas mais velhas que REQUEST_AUDIT_RETENTION_DAYS
 * (default 7). Pensado pra rodar em cron diário (Render cron job ou
 * GitHub Actions schedule).
 *
 * DELETE em lotes (LIMIT) em vez de um DELETE único:
 *   - WAL menor por transação (não estoura replicação/backup).
 *   - Tabela fica destravada entre lotes.
 *   - Pode ser interrompido sem perder muito trabalho.
 *
 * Após o prune, executa um VACUUM (sem FULL) para reciclar espaço
 * pras escritas seguintes — não devolve disco ao SO, mas evita o
 * crescimento contínuo. Use VACUUM FULL só em janela de manutenção.
 *
 * Uso:
 *   # Dry-run (default):
 *   node scripts/maintenance/prune-request-audit-logs.mjs
 *
 *   # Apaga:
 *   node scripts/maintenance/prune-request-audit-logs.mjs --yes
 *
 *   # Override de retenção:
 *   REQUEST_AUDIT_RETENTION_DAYS=3 node scripts/maintenance/prune-request-audit-logs.mjs --yes
 */

import "../../src/infrastructure/database/_load-dotenv-optional.js";
import { query, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--yes");
const SKIP_VACUUM = args.has("--no-vacuum");

const RETENTION_DAYS = (() => {
  const raw = Number(process.env.REQUEST_AUDIT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw < 1) return 7;
  return Math.min(raw, 365);
})();

const BATCH_SIZE = (() => {
  const raw = Number(process.env.REQUEST_AUDIT_PRUNE_BATCH_SIZE);
  if (!Number.isFinite(raw) || raw < 100) return 10_000;
  return Math.min(raw, 100_000);
})();

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

async function main() {
  console.log("=".repeat(72));
  console.log("prune-request-audit-logs");
  console.log("mode             :", APPLY ? "APPLY" : "DRY-RUN");
  console.log("retention (days) :", RETENTION_DAYS);
  console.log("batch size       :", BATCH_SIZE);
  console.log("=".repeat(72));

  const { rows: countBefore } = await query(
    `SELECT COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE created_at < NOW() - ($1::int || ' days')::interval)::bigint AS to_delete
       FROM public.request_audit_logs`,
    [RETENTION_DAYS]
  );
  const total = Number(countBefore[0].total);
  const toDelete = Number(countBefore[0].to_delete);
  console.log(`\nLinhas totais         : ${fmt(total)}`);
  console.log(`Linhas elegíveis      : ${fmt(toDelete)}`);

  if (!APPLY) {
    console.log("\nDRY-RUN. Para apagar, rode novamente com --yes.");
    return;
  }

  if (toDelete === 0) {
    console.log("\nNada a apagar.");
    return;
  }

  let totalDeleted = 0;
  const t0 = Date.now();
  // Loop até não sobrar elegíveis. Cada batch tem o limite alto o suficiente
  // pra ser eficiente, mas baixo pra não inflar WAL.
  for (;;) {
    const { rowCount } = await query(
      `
      DELETE FROM public.request_audit_logs
       WHERE id IN (
         SELECT id FROM public.request_audit_logs
          WHERE created_at < NOW() - ($1::int || ' days')::interval
          ORDER BY id
          LIMIT $2
       )
      `,
      [RETENTION_DAYS, BATCH_SIZE]
    );
    if (!rowCount || rowCount === 0) break;
    totalDeleted += rowCount;
    process.stdout.write(`  apagados: ${fmt(totalDeleted)}\r`);
  }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\nTotal apagado: ${fmt(totalDeleted)} (${elapsed}s)`);

  if (!SKIP_VACUUM) {
    console.log("\nRodando VACUUM (não-FULL)…");
    await query("VACUUM (ANALYZE) public.request_audit_logs");
    console.log("  ok");
  }

  const { rows: sizes } = await query(`
    SELECT pg_size_pretty(pg_total_relation_size('public.request_audit_logs')) AS total
  `);
  console.log(`\nTamanho atual da tabela: ${sizes[0].total}`);
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
