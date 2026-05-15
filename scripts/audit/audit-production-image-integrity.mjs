#!/usr/bin/env node
/**
 * Auditoria read-only de integridade de imagens dos anúncios.
 *
 * Detecta:
 *   - Anúncios ativos sem imagens (impacto direto na vitrine regional)
 *   - URLs apontando para /uploads/ legacy (não-R2)
 *   - URLs hospedadas em .onrender.com (legacy storage)
 *   - Capa que é placeholder/default
 *   - Duplicatas dentro do array
 *   - Arrays muito grandes (> 30 imagens)
 *   - URLs com encoding corrompido
 *
 * Uso:
 *   node scripts/audit/audit-production-image-integrity.mjs
 *   node scripts/audit/audit-production-image-integrity.mjs --sample
 *   node scripts/audit/audit-production-image-integrity.mjs --format=csv
 *   node scripts/audit/audit-production-image-integrity.mjs --print-schema
 *
 * Schema dinâmico (PR6): introspecta `information_schema.columns` para
 * `ads`. Required: id, images. Optional: title, slug, status, created_at,
 * city_id. Aborta cedo se `images` não existir.
 *
 * Read-only. Não faz HTTP HEAD nas URLs. Não altera produção.
 */

import "dotenv/config";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { detectImageIssues } from "./lib/detect-image-issues.mjs";
import {
  ALL_ADS_IMAGE_COLUMNS,
  buildImagesAuditQuery,
} from "./lib/image-integrity-query-builder.mjs";
import {
  fetchExistingColumns,
  parseAuditArgs,
  printSchemaDiagnostic,
  printSummary,
  truncate,
  writeCsvReport,
  writeJsonReport,
} from "./lib/audit-shared.mjs";

const args = parseAuditArgs(process.argv.slice(2));

function bucketSeverity(severity, buckets) {
  buckets[severity] = (buckets[severity] || 0) + 1;
}

async function main() {
  const availableColumns = await fetchExistingColumns(pool, "ads");

  if (args.printSchema) {
    printSchemaDiagnostic({
      table: "ads",
      available: availableColumns,
      requested: ALL_ADS_IMAGE_COLUMNS,
    });
    return;
  }

  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(
      `[audit-image-integrity] reading ${args.limit} ads (status=${args.statusFilter ?? "ANY"})…`
    );
  }

  const { sql, params, missing } = buildImagesAuditQuery({ availableColumns, args });
  if (!args.silent && missing.length > 0) {
    /* eslint-disable-next-line no-console */
    console.warn(
      `[audit-image-integrity] colunas OPCIONAIS ausentes em ads (omitidas): ${missing.join(", ")}`
    );
  }

  const result = await pool.query(sql, params);
  const ads = result.rows;

  const findings = [];
  const severityBuckets = {};

  for (const ad of ads) {
    const r = detectImageIssues(ad);
    if (!r.isProblematic) continue;
    bucketSeverity(r.severity, severityBuckets);

    findings.push({
      kind: "image_issue",
      id: ad.id,
      severity: r.severity,
      issue_codes: r.issues.map((i) => i.code).join("|"),
      issue_labels: r.issues.map((i) => i.label).slice(0, 5).join(" | "),
      issue_count: r.issues.length,
      title: truncate(ad.title, 60),
      slug: ad.slug,
      status: ad.status,
      city_id: ad.city_id,
      image_count: Array.isArray(ad.images)
        ? ad.images.length
        : typeof ad.images === "string"
          ? "stringified"
          : 0,
      sample_url: truncate(
        r.issues.find((i) => i.sampleUrl)?.sampleUrl ?? "",
        120
      ),
    });
  }

  const summary = {
    "ads scanned": ads.length,
    "with no images (critical)": severityBuckets.critical || 0,
    "high severity (legacy/malformed)": severityBuckets.high || 0,
    "medium severity (render/placeholder)": severityBuckets.medium || 0,
    "low severity (whitespace/ext)": severityBuckets.low || 0,
    "total problematic": findings.length,
    "share problematic":
      ads.length > 0 ? `${((findings.length / ads.length) * 100).toFixed(1)}%` : "n/a",
  };

  if (!args.silent) {
    printSummary({ title: "Image integrity audit", summary });
  }

  let reportPath;
  if (args.outputFormat === "csv") {
    reportPath = writeCsvReport({
      outputDir: args.outputDir,
      name: "image-integrity",
      rows: findings,
    });
  } else {
    reportPath = writeJsonReport({
      outputDir: args.outputDir,
      name: "image-integrity",
      summary,
      findings,
    });
  }

  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(`\nRelatório salvo em: ${reportPath}`);
  }
}

main()
  .catch((err) => {
    /* eslint-disable no-console */
    console.error("[audit-image-integrity] FALHOU:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    /* eslint-enable no-console */
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool().catch(() => {}));
