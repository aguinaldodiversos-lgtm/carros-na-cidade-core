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
 *
 * Read-only. Não faz HTTP HEAD nas URLs (apenas shape/heurística). Não
 * altera produção. Não mexe no R2 nem no /_next/image.
 */

import "dotenv/config";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { detectImageIssues } from "./lib/detect-image-issues.mjs";
import {
  parseAuditArgs,
  printSummary,
  truncate,
  writeCsvReport,
  writeJsonReport,
} from "./lib/audit-shared.mjs";

const args = parseAuditArgs(process.argv.slice(2));

async function fetchAds() {
  const where = [];
  const params = [];

  if (args.statusFilter) {
    params.push(args.statusFilter);
    where.push(`status = $${params.length}`);
  }
  if (args.sinceDays) {
    params.push(args.sinceDays);
    where.push(`created_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
  }

  params.push(args.limit);
  const limitPos = params.length;

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT id, title, slug, status, images, created_at, city_id
    FROM ads
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitPos}
    `,
    params
  );
  return result.rows;
}

function bucketSeverity(severity, buckets) {
  buckets[severity] = (buckets[severity] || 0) + 1;
}

async function main() {
  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(`[audit-image-integrity] reading ${args.limit} ads (status=${args.statusFilter ?? "ANY"})…`);
  }

  const ads = await fetchAds();
  const findings = [];
  const severityBuckets = {};

  for (const ad of ads) {
    const result = detectImageIssues(ad);
    if (!result.isProblematic) continue;
    bucketSeverity(result.severity, severityBuckets);

    findings.push({
      kind: "image_issue",
      id: ad.id,
      severity: result.severity,
      issue_codes: result.issues.map((i) => i.code).join("|"),
      issue_labels: result.issues.map((i) => i.label).slice(0, 5).join(" | "),
      issue_count: result.issues.length,
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
        result.issues.find((i) => i.sampleUrl)?.sampleUrl ?? "",
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
