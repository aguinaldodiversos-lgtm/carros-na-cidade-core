#!/usr/bin/env node
/**
 * Rollback de archive-test-ads.mjs — restaura `status` dos anúncios
 * arquivados a partir de um snapshot JSON.
 *
 * Uso:
 *   node scripts/cleanup/restore-archived-ads.mjs --snapshot-file=PATH                 # dry-run
 *   node scripts/cleanup/restore-archived-ads.mjs --snapshot-file=PATH --execute       # ainda dry-run
 *   node scripts/cleanup/restore-archived-ads.mjs --snapshot-file=PATH --execute --yes # aplica
 *
 * Mesma política de segurança do archive:
 *   - Default dry-run. --execute + --yes obrigatórios para escrever.
 *   - Transação com rehearsal commit (UPDATE roda em dry-run e é
 *     revertido — valida constraint, captura rowcount).
 *   - Lê EXCLUSIVAMENTE do snapshot. Não infere nada.
 *   - UPDATE com filtro WHERE id=$1 AND status=$2 (estado atual deve ser
 *     o targetStatus do archive — se mudou desde então, NÃO mexe).
 *
 * NÃO usa DELETE.
 */

import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { parseCleanupArgs, writeCleanupReport } from "./lib/cleanup-shared.mjs";

const args = parseCleanupArgs(process.argv.slice(2));

function log(...messages) {
  if (args.silent) return;
  /* eslint-disable-next-line no-console */
  console.log(...messages);
}

function loadSnapshot(filePath) {
  if (!filePath) {
    throw new Error(
      "[restore] --snapshot-file=PATH é obrigatório. Use o arquivo gerado por archive-test-ads.mjs em reports/cleanup/."
    );
  }
  if (!existsSync(filePath)) {
    throw new Error(`[restore] snapshot não encontrado: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.rows)) {
    throw new Error(`[restore] snapshot inválido (sem 'rows' array): ${filePath}`);
  }
  if (!parsed.targetStatus || !parsed.sourceStatus) {
    throw new Error(
      `[restore] snapshot inválido — precisa de sourceStatus e targetStatus (gerados pelo archive). Schema esperado em archive-test-ads.mjs.`
    );
  }
  return parsed;
}

async function main() {
  const snapshot = loadSnapshot(args.snapshotFile);
  log(`[restore] snapshot: ${args.snapshotFile}`);
  log(`[restore] arquivos foram movidos: ${snapshot.sourceStatus} → ${snapshot.targetStatus}`);
  log(`[restore] vou tentar reverter: ${snapshot.targetStatus} → ${snapshot.sourceStatus}`);
  log(`[restore] linhas no snapshot: ${snapshot.rows.length}`);

  if (snapshot.rows.length === 0) {
    log("[restore] snapshot vazio — nada a restaurar.");
    return;
  }

  const ranAt = new Date().toISOString();
  const restoredRows = [];
  let rolledBack = true;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Restaura linha a linha (status original pode variar de uma para outra,
    // embora no archive todas tenham vindo de 'active' — defensivo).
    for (const row of snapshot.rows) {
      const id = Number(row.id);
      if (!Number.isFinite(id)) continue;

      const previous = String(row.previous_status || snapshot.sourceStatus);
      const expectedCurrent = snapshot.targetStatus;

      const res = await client.query(
        `UPDATE ads
            SET status = $3
          WHERE id = $1
            AND status = $2
        RETURNING id, status`,
        [id, expectedCurrent, previous]
      );

      if (res.rowCount === 1) {
        restoredRows.push({ id, restoredTo: previous });
      } else {
        // Linha não está mais em targetStatus (alguém mexeu, ou nunca foi
        // arquivada). Não é erro fatal, mas registramos.
        restoredRows.push({ id, restoredTo: null, note: "skipped (current status != snapshot.targetStatus)" });
      }
    }

    const actuallyRestored = restoredRows.filter((r) => r.restoredTo != null).length;
    log(`[restore] linhas restauradas (rehearsal): ${actuallyRestored} de ${snapshot.rows.length}`);

    if (args.willWrite) {
      await client.query("COMMIT");
      rolledBack = false;
      log("[restore] COMMIT — rollback aplicado. ✅");
    } else {
      await client.query("ROLLBACK");
      rolledBack = true;
      log("[restore] ROLLBACK — dry-run (use --execute --yes para aplicar de fato).");
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

  const resultPath = writeCleanupReport({
    cleanupDir: args.cleanupDir,
    name: "restore-archived-ads-result",
    payload: {
      ranAt,
      mode: args.willWrite ? "execute" : "dry-run",
      rolledBack,
      committed: !rolledBack,
      sourceSnapshot: args.snapshotFile,
      snapshotSourceStatus: snapshot.sourceStatus,
      snapshotTargetStatus: snapshot.targetStatus,
      totalRows: snapshot.rows.length,
      restoredRows,
    },
  });
  log(`[restore] resultado salvo: ${resultPath}`);

  log("");
  log(args.willWrite ? "RESTORE concluído." : "DRY-RUN concluído. Use --execute --yes para aplicar.");
}

main()
  .catch((err) => {
    /* eslint-disable no-console */
    console.error("[restore-archived-ads] FALHOU:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    /* eslint-enable no-console */
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool().catch(() => {}));
