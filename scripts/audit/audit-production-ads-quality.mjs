#!/usr/bin/env node
/**
 * Auditoria read-only de qualidade dos anúncios em produção.
 *
 * Detecta:
 *   - Anúncios com sinais de teste/automation (DeployModel, lorem ipsum,
 *     "fila worker", etc.)
 *   - Slugs malformados (caracteres inválidos, > 200 chars, reservados)
 *   - Slugs DUPLICADOS (mesma string em > 1 anúncio ativo)
 *
 * Uso:
 *   node scripts/audit/audit-production-ads-quality.mjs
 *   node scripts/audit/audit-production-ads-quality.mjs --limit=5000
 *   node scripts/audit/audit-production-ads-quality.mjs --format=csv --out=./reports/audit
 *   node scripts/audit/audit-production-ads-quality.mjs --sample      # 100 ads, console-friendly
 *   node scripts/audit/audit-production-ads-quality.mjs --all-statuses  # inclui status != active
 *
 * Environment:
 *   DATABASE_URL — obrigatório (mesmo pool do backend).
 *
 * Saída:
 *   - reports/audit/ads-quality-<timestamp>.{json,csv}
 *   - Sumário no console (a menos que --silent).
 *
 * IMPORTANTE:
 *   - Read-only. Nenhum UPDATE/DELETE. Apenas SELECT.
 *   - PII redactada antes de escrever em arquivo.
 *   - Não faz HTTP para o anúncio (sem 200-check de URL).
 */

import "dotenv/config";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { detectTestAd } from "./lib/detect-test-ad.mjs";
import { detectBadSlug } from "./lib/detect-bad-slug.mjs";
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
    SELECT
      id, title, slug, brand, model, version, description,
      city, state, city_id, status, plan,
      created_at,
      advertiser_id, dealership_id
    FROM ads
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitPos}
    `,
    params
  );
  return result.rows;
}

async function fetchDuplicateSlugs() {
  const result = await pool.query(
    `
    SELECT slug, COUNT(*)::int AS cnt, ARRAY_AGG(id ORDER BY id) AS ids
    FROM ads
    WHERE slug IS NOT NULL
      AND slug <> ''
      ${args.statusFilter ? "AND status = $1" : ""}
    GROUP BY slug
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, slug ASC
    LIMIT 500
    `,
    args.statusFilter ? [args.statusFilter] : []
  );
  return result.rows;
}

async function main() {
  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(`[audit-ads-quality] reading up to ${args.limit} ads (status=${args.statusFilter ?? "ANY"})…`);
  }

  const [ads, duplicateSlugs] = await Promise.all([fetchAds(), fetchDuplicateSlugs()]);

  const testFindings = [];
  const slugFindings = [];

  let highSev = 0;
  let mediumSev = 0;
  let lowSev = 0;

  for (const ad of ads) {
    const testResult = detectTestAd(ad);
    if (testResult.isSuspect) {
      testFindings.push({
        kind: "test_ad_suspect",
        id: ad.id,
        confidence: testResult.confidence,
        reasons: testResult.reasons,
        reason_labels: testResult.reasonLabels,
        title: truncate(ad.title, 80),
        slug: ad.slug,
        brand: ad.brand,
        model: ad.model,
        status: ad.status,
        city_id: ad.city_id,
        state: ad.state,
        created_at: ad.created_at,
      });
      if (testResult.confidence === "high") highSev++;
      else if (testResult.confidence === "medium") mediumSev++;
      else if (testResult.confidence === "low") lowSev++;
    }

    const slugResult = detectBadSlug(ad);
    if (slugResult.isBad) {
      slugFindings.push({
        kind: "slug_bad",
        id: ad.id,
        severity: slugResult.severity,
        issues: slugResult.issues.map((i) => i.code).join("|"),
        issue_labels: slugResult.issues.map((i) => i.label).join(" | "),
        slug: ad.slug,
        suggested: slugResult.suggested,
        title: truncate(ad.title, 80),
      });
      if (slugResult.severity === "critical" || slugResult.severity === "high") highSev++;
      else if (slugResult.severity === "medium") mediumSev++;
      else if (slugResult.severity === "low") lowSev++;
    }
  }

  const duplicateFindings = duplicateSlugs.map((row) => ({
    kind: "slug_duplicate",
    slug: row.slug,
    duplicates: row.cnt,
    ids: row.ids,
  }));
  highSev += duplicateFindings.length;

  const summary = {
    "ads scanned": ads.length,
    "test-suspect (high)": testFindings.filter((f) => f.confidence === "high").length,
    "test-suspect (medium)": testFindings.filter((f) => f.confidence === "medium").length,
    "test-suspect (low)": testFindings.filter((f) => f.confidence === "low").length,
    "slug-issues (critical)": slugFindings.filter((f) => f.severity === "critical").length,
    "slug-issues (high)": slugFindings.filter((f) => f.severity === "high").length,
    "slug-issues (medium)": slugFindings.filter((f) => f.severity === "medium").length,
    "slug-issues (low)": slugFindings.filter((f) => f.severity === "low").length,
    "slug duplicates (groups)": duplicateFindings.length,
    "total findings": testFindings.length + slugFindings.length + duplicateFindings.length,
    "high+critical total": highSev,
  };

  if (!args.silent) {
    printSummary({ title: "Ads quality audit", summary });
  }

  const allFindings = [...testFindings, ...slugFindings, ...duplicateFindings];

  let reportPath;
  if (args.outputFormat === "csv") {
    reportPath = writeCsvReport({
      outputDir: args.outputDir,
      name: "ads-quality",
      rows: allFindings,
    });
  } else {
    reportPath = writeJsonReport({
      outputDir: args.outputDir,
      name: "ads-quality",
      summary,
      findings: allFindings,
    });
  }

  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(`\nRelatório salvo em: ${reportPath}`);
  }

  return { reportPath, summary };
}

main()
  .catch((err) => {
    /* eslint-disable no-console */
    console.error("[audit-ads-quality] FALHOU:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    /* eslint-enable no-console */
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool().catch(() => {}));
