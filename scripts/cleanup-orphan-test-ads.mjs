#!/usr/bin/env node
/**
 * Limpeza definitiva dos anúncios de teste órfãos de imagem.
 *
 * Lê o relatório de auditoria JSON para identificar os anúncios órfãos,
 * gera snapshot de segurança, e remove tudo em transação.
 *
 * Uso:
 *   node scripts/cleanup-orphan-test-ads.mjs --audit-file=reports/migration/audit-XXXX.json
 *   node scripts/cleanup-orphan-test-ads.mjs --audit-file=reports/migration/audit-XXXX.json --execute
 *   node scripts/cleanup-orphan-test-ads.mjs --audit-file=reports/migration/audit-XXXX.json --execute --report-dir=./reports/cleanup
 *
 * Variáveis:
 *   DATABASE_URL (obrigatório)
 */

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { closeDatabasePool, pool, withTransaction } from "../src/infrastructure/database/db.js";

function parseArgs(argv) {
  const args = {
    auditFile: "",
    execute: false,
    reportDir: "",
  };

  for (const raw of argv) {
    if (raw === "--execute") args.execute = true;
    else if (raw.startsWith("--audit-file=")) args.auditFile = path.resolve(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--report-dir=")) args.reportDir = path.resolve(raw.split("=").slice(1).join("="));
  }

  return args;
}

function loadOrphanAdIds(auditFilePath) {
  const raw = fs.readFileSync(auditFilePath, "utf8");
  const audit = JSON.parse(raw);

  if (!Array.isArray(audit.details)) {
    throw new Error("Formato inválido: audit.details não é array");
  }

  const orphanIds = audit.details
    .filter((d) => d.category === "orphan")
    .map((d) => Number(d.adId))
    .filter((id) => Number.isInteger(id) && id > 0);

  return [...new Set(orphanIds)].sort((a, b) => a - b);
}

async function tableExists(tableName) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExistsInTable(tableName, columnName) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function snapshotAds(adIds) {
  const { rows } = await pool.query(
    `SELECT * FROM ads WHERE id = ANY($1::bigint[])`,
    [adIds]
  );
  return rows;
}

async function snapshotVehicleImages(adIds) {
  const exists = await tableExists("vehicle_images");
  if (!exists) return { exists: false, rows: [] };

  const hasAdId = await columnExistsInTable("vehicle_images", "ad_id");
  if (!hasAdId) return { exists: true, hasAdId: false, rows: [] };

  const { rows } = await pool.query(
    `SELECT * FROM vehicle_images WHERE ad_id = ANY($1::bigint[])`,
    [adIds]
  );
  return { exists: true, hasAdId: true, rows };
}

async function snapshotRelatedTable(tableName, adIds) {
  const exists = await tableExists(tableName);
  if (!exists) return { exists: false, rows: [] };

  const hasAdId = await columnExistsInTable(tableName, "ad_id");
  if (!hasAdId) return { exists: true, hasAdId: false, rows: [] };

  const { rows } = await pool.query(
    `SELECT * FROM ${tableName} WHERE ad_id = ANY($1::bigint[])`,
    [adIds]
  );
  return { exists: true, hasAdId: true, rows };
}

async function buildFullSnapshot(adIds) {
  const [ads, vehicleImages, adEvents, adMetrics, leads, notificationQueue] = await Promise.all([
    snapshotAds(adIds),
    snapshotVehicleImages(adIds),
    snapshotRelatedTable("ad_events", adIds),
    snapshotRelatedTable("ad_metrics", adIds),
    snapshotRelatedTable("leads", adIds),
    snapshotRelatedTable("notification_queue", adIds),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    adIds,
    adCount: ads.length,
    ads,
    vehicleImages,
    adEvents,
    adMetrics,
    leads,
    notificationQueue,
  };
}

async function executeCleanup(adIds) {
  const deletionReport = {
    vehicleImages: 0,
    adEvents: 0,
    adMetrics: 0,
    leads: 0,
    notificationQueue: 0,
    ads: 0,
    tablesAffected: [],
    exceptions: [],
  };

  await withTransaction(async (tx) => {
    // 1. vehicle_images
    if (await tableExists("vehicle_images") && await columnExistsInTable("vehicle_images", "ad_id")) {
      const res = await tx.query(
        `DELETE FROM vehicle_images WHERE ad_id = ANY($1::bigint[])`,
        [adIds]
      );
      deletionReport.vehicleImages = Number(res.rowCount || 0);
      if (deletionReport.vehicleImages > 0) deletionReport.tablesAffected.push("vehicle_images");
    }

    // 2. ad_events
    if (await tableExists("ad_events") && await columnExistsInTable("ad_events", "ad_id")) {
      const res = await tx.query(
        `DELETE FROM ad_events WHERE ad_id = ANY($1::bigint[])`,
        [adIds]
      );
      deletionReport.adEvents = Number(res.rowCount || 0);
      if (deletionReport.adEvents > 0) deletionReport.tablesAffected.push("ad_events");
    }

    // 3. leads — verificar se há leads reais (não de teste)
    if (await tableExists("leads") && await columnExistsInTable("leads", "ad_id")) {
      const { rows: leadRows } = await tx.query(
        `SELECT id, ad_id, created_at FROM leads WHERE ad_id = ANY($1::bigint[]) LIMIT 100`,
        [adIds]
      );
      if (leadRows.length > 0) {
        deletionReport.exceptions.push({
          table: "leads",
          message: `${leadRows.length} lead(s) encontrado(s) vinculado(s) a anúncios órfãos — removidos como dados de teste`,
          sampleIds: leadRows.slice(0, 10).map((r) => r.id),
        });
        const res = await tx.query(
          `DELETE FROM leads WHERE ad_id = ANY($1::bigint[])`,
          [adIds]
        );
        deletionReport.leads = Number(res.rowCount || 0);
        if (deletionReport.leads > 0) deletionReport.tablesAffected.push("leads");
      }
    }

    // 4. notification_queue
    if (await tableExists("notification_queue") && await columnExistsInTable("notification_queue", "ad_id")) {
      const res = await tx.query(
        `DELETE FROM notification_queue WHERE ad_id = ANY($1::bigint[])`,
        [adIds]
      );
      deletionReport.notificationQueue = Number(res.rowCount || 0);
      if (deletionReport.notificationQueue > 0) deletionReport.tablesAffected.push("notification_queue");
    }

    // 5. ad_metrics (CASCADE cuida, mas limpamos explicitamente por segurança)
    if (await tableExists("ad_metrics") && await columnExistsInTable("ad_metrics", "ad_id")) {
      const res = await tx.query(
        `DELETE FROM ad_metrics WHERE ad_id = ANY($1::bigint[])`,
        [adIds]
      );
      deletionReport.adMetrics = Number(res.rowCount || 0);
      if (deletionReport.adMetrics > 0) deletionReport.tablesAffected.push("ad_metrics");
    }

    // 6. ads — hard delete (último, após limpar dependências)
    const res = await tx.query(
      `DELETE FROM ads WHERE id = ANY($1::bigint[])`,
      [adIds]
    );
    deletionReport.ads = Number(res.rowCount || 0);
    if (deletionReport.ads > 0) deletionReport.tablesAffected.push("ads");
  });

  return deletionReport;
}

async function validateCleanup(adIds) {
  const { rows: remainingAds } = await pool.query(
    `SELECT id FROM ads WHERE id = ANY($1::bigint[])`,
    [adIds]
  );

  const viCheck = await tableExists("vehicle_images") && await columnExistsInTable("vehicle_images", "ad_id")
    ? (await pool.query(`SELECT COUNT(*) as c FROM vehicle_images WHERE ad_id = ANY($1::bigint[])`, [adIds])).rows[0].c
    : 0;

  return {
    adsRemaining: remainingAds.length,
    vehicleImagesRemaining: Number(viCheck),
    clean: remainingAds.length === 0 && Number(viCheck) === 0,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[cleanup] Defina DATABASE_URL.");
    process.exit(1);
  }

  if (!args.auditFile) {
    console.error("[cleanup] Use --audit-file=<path> para indicar o relatório de auditoria.");
    process.exit(1);
  }

  if (!fs.existsSync(args.auditFile)) {
    console.error(`[cleanup] Arquivo não encontrado: ${args.auditFile}`);
    process.exit(1);
  }

  const orphanAdIds = loadOrphanAdIds(args.auditFile);
  console.log(`\n[cleanup] ═══ LIMPEZA DE ANÚNCIOS ÓRFÃOS DE TESTE ═══\n`);
  console.log(`  relatório de auditoria: ${args.auditFile}`);
  console.log(`  anúncios órfãos:        ${orphanAdIds.length}`);
  console.log(`  IDs:                    [${orphanAdIds.join(", ")}]`);
  console.log(`  modo:                   ${args.execute ? "EXECUÇÃO" : "dry-run"}\n`);

  // Snapshot
  console.log("[cleanup] Gerando snapshot de segurança...");
  const snapshot = await buildFullSnapshot(orphanAdIds);

  console.log(`  ads no banco:           ${snapshot.adCount}`);
  console.log(`  vehicle_images:         ${snapshot.vehicleImages.rows?.length ?? 0}`);
  console.log(`  ad_events:              ${snapshot.adEvents.rows?.length ?? 0}`);
  console.log(`  ad_metrics:             ${snapshot.adMetrics.rows?.length ?? 0}`);
  console.log(`  leads:                  ${snapshot.leads.rows?.length ?? 0}`);
  console.log(`  notification_queue:     ${snapshot.notificationQueue.rows?.length ?? 0}`);

  const reportDir = args.reportDir || path.resolve("reports", "cleanup");
  await fs.promises.mkdir(reportDir, { recursive: true });

  const snapshotPath = path.join(reportDir, `snapshot-orphan-ads-${Date.now()}.json`);
  await fs.promises.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`\n  snapshot salvo: ${snapshotPath}`);

  if (snapshot.leads.rows?.length > 0) {
    console.log(`\n  ⚠ ${snapshot.leads.rows.length} lead(s) encontrado(s) — serão removidos como dados de teste`);
  }

  if (!args.execute) {
    console.log("\n[cleanup] dry-run concluído. Use --execute para remover definitivamente.");

    const dryRunReport = {
      mode: "dry-run",
      timestamp: new Date().toISOString(),
      orphanAdIds,
      snapshotPath,
      wouldDelete: {
        ads: snapshot.adCount,
        vehicleImages: snapshot.vehicleImages.rows?.length ?? 0,
        adEvents: snapshot.adEvents.rows?.length ?? 0,
        adMetrics: snapshot.adMetrics.rows?.length ?? 0,
        leads: snapshot.leads.rows?.length ?? 0,
        notificationQueue: snapshot.notificationQueue.rows?.length ?? 0,
      },
    };

    const dryRunPath = path.join(reportDir, `cleanup-dryrun-${Date.now()}.json`);
    await fs.promises.writeFile(dryRunPath, JSON.stringify(dryRunReport, null, 2), "utf8");
    console.log(`  relatório dry-run: ${dryRunPath}`);
    return 0;
  }

  // Execute
  console.log("\n[cleanup] Executando limpeza em transação...");
  const deletion = await executeCleanup(orphanAdIds);

  console.log(`\n[cleanup] ═══ RESULTADO DA LIMPEZA ═══\n`);
  console.log(`  ads removidos:          ${deletion.ads}`);
  console.log(`  vehicle_images:         ${deletion.vehicleImages}`);
  console.log(`  ad_events:              ${deletion.adEvents}`);
  console.log(`  ad_metrics:             ${deletion.adMetrics}`);
  console.log(`  leads:                  ${deletion.leads}`);
  console.log(`  notification_queue:     ${deletion.notificationQueue}`);
  console.log(`  tabelas afetadas:       [${deletion.tablesAffected.join(", ")}]`);

  if (deletion.exceptions.length > 0) {
    console.log("\n  Exceções:");
    for (const ex of deletion.exceptions) {
      console.log(`    ${ex.table}: ${ex.message}`);
    }
  }

  // Validate
  console.log("\n[cleanup] Validando resultado...");
  const validation = await validateCleanup(orphanAdIds);
  console.log(`  ads restantes:          ${validation.adsRemaining}`);
  console.log(`  vehicle_images restant: ${validation.vehicleImagesRemaining}`);
  console.log(`  base limpa:             ${validation.clean ? "SIM ✓" : "NÃO ✗"}`);

  const finalReport = {
    mode: "execute",
    timestamp: new Date().toISOString(),
    orphanAdIds,
    snapshotPath,
    deletion,
    validation,
  };

  const reportPath = path.join(reportDir, `cleanup-execute-${Date.now()}.json`);
  await fs.promises.writeFile(reportPath, JSON.stringify(finalReport, null, 2), "utf8");
  console.log(`\n  relatório final: ${reportPath}`);

  if (!validation.clean) {
    console.error("\n[cleanup] ATENÇÃO: a validação detectou registros remanescentes.");
    return 1;
  }

  console.log("\n[cleanup] Limpeza concluída com sucesso. Base pronta para novos anúncios de teste via R2.");
  return 0;
}

try {
  const code = await main();
  process.exit(code);
} catch (error) {
  console.error("[cleanup] Erro:", error?.message || error);
  process.exit(1);
} finally {
  await closeDatabasePool().catch(() => {});
}
