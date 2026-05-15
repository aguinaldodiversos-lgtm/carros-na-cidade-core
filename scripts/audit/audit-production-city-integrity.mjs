#!/usr/bin/env node
/**
 * Auditoria read-only da integridade territorial — cidades + consistência
 * entre `ads` e `cities`.
 *
 * Detecta:
 *   - Cidades com encoding corrompido (SÆo, Ã£, Ã©)
 *   - Cidades com state inválido (não UF brasileira)
 *   - Cidades com slug em formato errado (não bate `nome-uf`)
 *   - Inconsistência ads.city/state vs cities.name/state
 *   - Anúncios ativos sem city_id quando deveriam ter
 *   - Cidades sem coordenadas (impede regional para a base)
 *
 * Uso:
 *   node scripts/audit/audit-production-city-integrity.mjs
 *   node scripts/audit/audit-production-city-integrity.mjs --sample
 *   node scripts/audit/audit-production-city-integrity.mjs --format=csv
 *
 * Read-only. PII redactada. Sem alteração de produção.
 */

import "dotenv/config";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { detectMalformedCity } from "./lib/detect-malformed-city.mjs";
import {
  parseAuditArgs,
  printSummary,
  truncate,
  writeCsvReport,
  writeJsonReport,
} from "./lib/audit-shared.mjs";

const args = parseAuditArgs(process.argv.slice(2));

async function fetchCities() {
  const result = await pool.query(
    `
    SELECT id, name, slug, state, latitude, longitude
    FROM cities
    ORDER BY name ASC
    LIMIT $1
    `,
    [args.limit]
  );
  return result.rows;
}

async function fetchAdCityJoin() {
  const where = [];
  const params = [];

  if (args.statusFilter) {
    params.push(args.statusFilter);
    where.push(`a.status = $${params.length}`);
  }
  params.push(args.limit);
  const limitPos = params.length;

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      a.id          AS ad_id,
      a.title       AS ad_title,
      a.city        AS ad_city,
      a.state       AS ad_state,
      a.city_id     AS ad_city_id,
      a.status      AS ad_status,
      c.id          AS city_id,
      c.name        AS city_name,
      c.slug        AS city_slug,
      c.state       AS city_state,
      c.latitude    AS city_lat,
      c.longitude   AS city_lng
    FROM ads a
    LEFT JOIN cities c ON c.id = a.city_id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${limitPos}
    `,
    params
  );
  return result.rows;
}

async function fetchOrphanAds() {
  const params = [];
  let where = "a.city_id IS NULL";
  if (args.statusFilter) {
    params.push(args.statusFilter);
    where = `${where} AND a.status = $${params.length}`;
  }
  const result = await pool.query(
    `
    SELECT a.id, a.title, a.city, a.state, a.status, a.created_at
    FROM ads a
    WHERE ${where}
    ORDER BY a.created_at DESC
    LIMIT 500
    `,
    params
  );
  return result.rows;
}

async function fetchCitiesMissingCoords() {
  const result = await pool.query(
    `
    SELECT id, name, slug, state
    FROM cities
    WHERE latitude IS NULL OR longitude IS NULL
    ORDER BY name ASC
    LIMIT 200
    `
  );
  return result.rows;
}

async function main() {
  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(`[audit-city-integrity] reading cities + ad joins (limit=${args.limit})…`);
  }

  const [cities, adJoin, orphans, missingCoords] = await Promise.all([
    fetchCities(),
    fetchAdCityJoin(),
    fetchOrphanAds(),
    fetchCitiesMissingCoords(),
  ]);

  const cityFindings = [];
  for (const city of cities) {
    const result = detectMalformedCity(city);
    if (result.isMalformed) {
      cityFindings.push({
        kind: "city_malformed",
        id: city.id,
        severity: result.severity,
        issues: result.issues.map((i) => i.code).join("|"),
        issue_labels: result.issues.map((i) => i.label).join(" | "),
        name: city.name,
        slug: city.slug,
        state: city.state,
        suggested_slug: result.suggestedSlug,
        auto_fixable: result.autoFixable,
      });
    }
  }

  const adInconsistencyFindings = [];
  for (const row of adJoin) {
    if (row.ad_city_id == null) continue;

    const result = detectMalformedCity({
      name: row.city_name,
      slug: row.city_slug,
      state: row.city_state,
      city_id: row.ad_city_id,
      ad_state: row.ad_state,
      ad_city: row.ad_city,
    });

    if (result.isMalformed) {
      adInconsistencyFindings.push({
        kind: "ad_city_inconsistency",
        ad_id: row.ad_id,
        ad_title: truncate(row.ad_title, 60),
        city_id: row.ad_city_id,
        city_name: row.city_name,
        city_slug: row.city_slug,
        city_state: row.city_state,
        ad_city: row.ad_city,
        ad_state: row.ad_state,
        severity: result.severity,
        issues: result.issues.map((i) => i.code).join("|"),
      });
    }
  }

  const orphanFindings = orphans.map((o) => ({
    kind: "ad_orphan_no_city_id",
    id: o.id,
    title: truncate(o.title, 60),
    city: o.city,
    state: o.state,
    status: o.status,
    created_at: o.created_at,
  }));

  const missingCoordsFindings = missingCoords.map((c) => ({
    kind: "city_missing_coords",
    id: c.id,
    name: c.name,
    slug: c.slug,
    state: c.state,
    impact: "Não pode ser cidade-base regional (haversine requer lat/lng)",
  }));

  const allFindings = [
    ...cityFindings,
    ...adInconsistencyFindings,
    ...orphanFindings,
    ...missingCoordsFindings,
  ];

  const summary = {
    "cities scanned": cities.length,
    "ads scanned (joined)": adJoin.length,
    "city malformed (critical)": cityFindings.filter((f) => f.severity === "critical").length,
    "city malformed (high)": cityFindings.filter((f) => f.severity === "high").length,
    "city malformed (medium)": cityFindings.filter((f) => f.severity === "medium").length,
    "ad-city inconsistencies": adInconsistencyFindings.length,
    "ads without city_id (orphan)": orphanFindings.length,
    "cities missing lat/lng": missingCoordsFindings.length,
    "total findings": allFindings.length,
  };

  if (!args.silent) {
    printSummary({ title: "City integrity audit", summary });
  }

  let reportPath;
  if (args.outputFormat === "csv") {
    reportPath = writeCsvReport({
      outputDir: args.outputDir,
      name: "city-integrity",
      rows: allFindings,
    });
  } else {
    reportPath = writeJsonReport({
      outputDir: args.outputDir,
      name: "city-integrity",
      summary,
      findings: allFindings,
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
    console.error("[audit-city-integrity] FALHOU:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    /* eslint-enable no-console */
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool().catch(() => {}));
