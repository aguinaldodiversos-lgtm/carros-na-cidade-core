#!/usr/bin/env node
/**
 * Arquivamento seguro de anúncios de teste (test_ad_suspect HIGH).
 *
 * Pipeline:
 *   1. Carrega o relatório mais recente de ads-quality em reports/audit/
 *      (ou via --audit-file=PATH).
 *   2. Filtra findings: kind=test_ad_suspect AND confidence=high.
 *   3. Introspecta schema de `ads` (colunas existentes).
 *   4. Computa inventário ATUAL (total ativo, por estado, por cidade).
 *   5. Computa inventário SIMULADO pós-arquivamento.
 *   6. Abre transação, SELECT snapshot (rows ainda em status='active'),
 *      grava reports/cleanup/archive-test-ads-snapshot-*.json.
 *   7. UPDATE ads SET status='archived_test' (configurável via --status)
 *      WHERE id = ANY([candidatos]) AND status = 'active' RETURNING id.
 *   8. Se --dry-run (default) OU não veio --yes → ROLLBACK. Grava
 *      reports/cleanup/archive-test-ads-result-*.json marcando
 *      rolledBack=true.
 *   9. Se --execute --yes → COMMIT. Grava result com rolledBack=false.
 *  10. Imprime sumário + alertas de inventário.
 *  11. Se --reaudit, spawna os 3 scripts de auditoria.
 *
 * Padrão "rehearsal commit": o UPDATE roda mesmo em dry-run, mas é
 * revertido. Isso valida constraints (ex.: check constraint em status)
 * SEM mudar dados. Se houver violação, o erro aparece no dry-run e o
 * operador corrige antes do --execute --yes.
 *
 * Uso:
 *   node scripts/cleanup/archive-test-ads.mjs                  # dry-run
 *   node scripts/cleanup/archive-test-ads.mjs --execute        # ainda dry-run (--yes faltando)
 *   node scripts/cleanup/archive-test-ads.mjs --execute --yes  # aplica
 *   node scripts/cleanup/archive-test-ads.mjs --execute --yes --reaudit
 *   node scripts/cleanup/archive-test-ads.mjs --status=archived
 *   node scripts/cleanup/archive-test-ads.mjs --audit-file=reports/audit/ads-quality-X.json
 *
 * NÃO usa DELETE. NUNCA apaga linhas. Teste estático em
 * tests/cleanup/no-delete.test.js valida.
 */

import "dotenv/config";

import { spawn } from "node:child_process";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { fetchExistingColumns } from "../audit/lib/audit-shared.mjs";
import {
  buildArchiveUpdateQuery,
  buildInventoryQueries,
  buildSnapshotEntry,
  buildSnapshotSelectQuery,
  computeInventoryAlerts,
} from "./lib/archive-helpers.mjs";
import {
  findLatestAuditReport,
  loadAuditReport,
  parseCleanupArgs,
  printInventoryReport,
  selectArchivalCandidates,
  writeCleanupReport,
} from "./lib/cleanup-shared.mjs";

const args = parseCleanupArgs(process.argv.slice(2));
const ARCHIVE_REASON = "test_ad_suspect:high";
const SOURCE_STATUS = "active";

function log(...messages) {
  if (args.silent) return;
  /* eslint-disable-next-line no-console */
  console.log(...messages);
}

function warn(...messages) {
  /* eslint-disable-next-line no-console */
  console.warn(...messages);
}

async function fetchInventoryRow(client, { excludeIds, availableColumns }) {
  const queries = buildInventoryQueries({ excludeIds, availableColumns });
  const [totalRes, byStateRes, byCityRes] = await Promise.all([
    client.query(queries.total.sql, queries.total.params),
    queries.byState ? client.query(queries.byState.sql, queries.byState.params) : Promise.resolve({ rows: [] }),
    queries.byCity ? client.query(queries.byCity.sql, queries.byCity.params) : Promise.resolve({ rows: [] }),
  ]);

  return {
    totalActive: Number(totalRes.rows[0]?.total || 0),
    byState: byStateRes.rows,
    byCity: byCityRes.rows,
  };
}

function spawnAuditScripts() {
  const scripts = [
    ["scripts/audit/audit-production-ads-quality.mjs", "--limit=5000"],
    ["scripts/audit/audit-production-city-integrity.mjs"],
    ["scripts/audit/audit-production-image-integrity.mjs", "--limit=5000"],
  ];

  return new Promise((resolveAll) => {
    let index = 0;
    function next() {
      if (index >= scripts.length) return resolveAll();
      const [script, ...scriptArgs] = scripts[index++];
      log(`\n[reaudit] node ${script} ${scriptArgs.join(" ")}`);
      const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: "inherit" });
      child.on("exit", () => next());
      child.on("error", () => next());
    }
    next();
  });
}

async function main() {
  // 1. Localiza o relatório de auditoria.
  const auditFile = args.auditFile || findLatestAuditReport(args.auditDir, "ads-quality");
  if (!auditFile) {
    throw new Error(
      `Nenhum relatório ads-quality-*.json encontrado em ${args.auditDir}. ` +
        `Rode 'node scripts/audit/audit-production-ads-quality.mjs --limit=5000' antes.`
    );
  }

  log(`[archive-test-ads] usando relatório: ${auditFile}`);

  const report = loadAuditReport(auditFile);
  const candidates = selectArchivalCandidates(report.findings);

  if (candidates.length === 0) {
    log("[archive-test-ads] Nenhum candidato (test_ad_suspect HIGH) — nada a fazer. ✅");
    return;
  }

  const candidateIds = candidates.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
  log(`[archive-test-ads] candidatos test_ad_suspect:high → ${candidateIds.length}`);

  // 2. Schema introspect.
  const availableColumns = await fetchExistingColumns(pool, "ads");
  if (!availableColumns.has("status")) {
    throw new Error("[archive-test-ads] ads.status ausente — auditoria incompatível.");
  }

  // 3. Inventário ANTES (sem exclusões — pinta a foto atual).
  const baseClient = await pool.connect();
  let inventoryBefore;
  let inventoryAfterPreview;
  try {
    inventoryBefore = await fetchInventoryRow(baseClient, {
      excludeIds: [],
      availableColumns,
    });
    inventoryAfterPreview = await fetchInventoryRow(baseClient, {
      excludeIds: candidateIds,
      availableColumns,
    });
  } finally {
    baseClient.release();
  }

  printInventoryReport({
    title: "Inventário ATUAL",
    totalActive: inventoryBefore.totalActive,
    byState: inventoryBefore.byState,
    byCity: inventoryBefore.byCity,
    alerts: [],
  });

  const previewAlerts = computeInventoryAlerts({
    totalActiveAfter: inventoryAfterPreview.totalActive,
    minRemainingActive: args.minRemainingActive,
  });

  printInventoryReport({
    title: `Inventário SIMULADO após arquivar ${candidateIds.length} anúncio(s) de teste`,
    totalActive: inventoryAfterPreview.totalActive,
    byState: inventoryAfterPreview.byState,
    byCity: inventoryAfterPreview.byCity,
    alerts: previewAlerts,
  });

  // 4. Transação: snapshot + UPDATE.
  const client = await pool.connect();
  let snapshotEntries = [];
  let updatedRows = [];
  let rolledBack = true;
  const archiveTimestamp = new Date().toISOString();

  try {
    await client.query("BEGIN");

    // Snapshot — só anúncios que AINDA estão em status=active.
    const snapBuild = buildSnapshotSelectQuery({
      candidateIds,
      fromStatus: SOURCE_STATUS,
      availableColumns,
    });
    const snapRes = await client.query(snapBuild.sql, snapBuild.params);

    snapshotEntries = snapRes.rows.map((row) =>
      buildSnapshotEntry({ row, reason: ARCHIVE_REASON, archiveTimestamp })
    );

    log(
      `[archive-test-ads] snapshot capturado: ${snapshotEntries.length} anúncio(s) ainda em status='${SOURCE_STATUS}'`
    );
    if (snapshotEntries.length < candidateIds.length) {
      warn(
        `[archive-test-ads] ${candidateIds.length - snapshotEntries.length} candidato(s) já não estão em status='${SOURCE_STATUS}' — pulados.`
      );
    }

    // Grava snapshot ANTES do UPDATE — caso o UPDATE falhe, ainda temos
    // o snapshot para investigação.
    const snapshotPath = writeCleanupReport({
      cleanupDir: args.cleanupDir,
      name: "archive-test-ads-snapshot",
      payload: {
        generatedAt: archiveTimestamp,
        reason: ARCHIVE_REASON,
        sourceAuditReport: auditFile,
        sourceStatus: SOURCE_STATUS,
        targetStatus: args.status,
        totalCandidates: candidateIds.length,
        snapshotEntries: snapshotEntries.length,
        affectedIds: snapshotEntries.map((e) => e.id),
        rows: snapshotEntries,
      },
    });
    log(`[archive-test-ads] snapshot salvo: ${snapshotPath}`);

    if (snapshotEntries.length === 0) {
      log("[archive-test-ads] Nada a atualizar — todos os candidatos já saíram de active.");
      await client.query("ROLLBACK");
      rolledBack = true;
    } else {
      // UPDATE — sempre roda (rehearsal commit). Se constraint quebrar,
      // o erro aparece no dry-run e o operador corrige antes do execute.
      const updBuild = buildArchiveUpdateQuery({
        candidateIds: snapshotEntries.map((e) => e.id),
        fromStatus: SOURCE_STATUS,
        toStatus: args.status,
      });
      const updRes = await client.query(updBuild.sql, updBuild.params);
      updatedRows = updRes.rows;
      log(`[archive-test-ads] UPDATE executado (rehearsal): ${updatedRows.length} linha(s) atualizadas`);

      if (args.willWrite) {
        await client.query("COMMIT");
        rolledBack = false;
        log("[archive-test-ads] COMMIT — alterações persistidas. ✅");
      } else {
        await client.query("ROLLBACK");
        rolledBack = true;
        log("[archive-test-ads] ROLLBACK — dry-run (use --execute --yes para aplicar).");
      }
    }
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    rolledBack = true;
    throw err;
  } finally {
    client.release();
  }

  // 5. Relatório final.
  const resultPath = writeCleanupReport({
    cleanupDir: args.cleanupDir,
    name: "archive-test-ads-result",
    payload: {
      ranAt: archiveTimestamp,
      mode: args.willWrite ? "execute" : "dry-run",
      rolledBack,
      committed: !rolledBack,
      sourceAuditReport: auditFile,
      reason: ARCHIVE_REASON,
      sourceStatus: SOURCE_STATUS,
      targetStatus: args.status,
      candidates: candidateIds.length,
      snapshotEntries: snapshotEntries.length,
      affectedRows: updatedRows.length,
      affectedIds: updatedRows.map((r) => r.id),
      inventoryBefore: {
        totalActive: inventoryBefore.totalActive,
        byState: inventoryBefore.byState,
      },
      inventoryAfter: rolledBack
        ? inventoryAfterPreview // preview (não foi aplicado)
        : { totalActive: inventoryAfterPreview.totalActive, byState: inventoryAfterPreview.byState },
      inventoryAlerts: previewAlerts,
      seoRecommendation:
        previewAlerts.length > 0
          ? "NÃO ativar REGIONAL_PAGE_INDEXABLE — inventário insuficiente após cleanup."
          : "Inventário ok pós-cleanup; ainda assim revisar manualmente antes de ativar SEO regional.",
    },
  });
  log(`[archive-test-ads] resultado salvo: ${resultPath}`);

  if (args.reaudit) {
    log("\n[archive-test-ads] disparando reauditoria…");
    await spawnAuditScripts();
  }

  log("");
  log(args.willWrite ? "EXECUTE concluído." : "DRY-RUN concluído. Use --execute --yes para aplicar.");
}

main()
  .catch((err) => {
    /* eslint-disable no-console */
    console.error("[archive-test-ads] FALHOU:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    /* eslint-enable no-console */
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool().catch(() => {}));
