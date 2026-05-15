#!/usr/bin/env node
/**
 * Auditoria read-only da integridade territorial — cidades + consistência
 * ads vs cities.
 *
 * Detecta:
 *   - Cidades com encoding corrompido (SÆo, Ã£, Ã©)
 *   - Cidades com state inválido (não UF brasileira)
 *   - Cidades com slug em formato errado
 *   - Inconsistência ads.city/state vs cities.name/state
 *   - Anúncios ativos sem city_id quando deveriam ter
 *   - Cidades sem coordenadas (impede regional para a base)
 *
 * Uso:
 *   node scripts/audit/audit-production-city-integrity.mjs
 *   node scripts/audit/audit-production-city-integrity.mjs --sample
 *   node scripts/audit/audit-production-city-integrity.mjs --format=csv
 *   node scripts/audit/audit-production-city-integrity.mjs --print-schema
 *
 * Schema dinâmico (PR6):
 *   Antes de SELECT, lê information_schema.columns para `cities` e `ads`.
 *   Colunas OPCIONAIS ausentes viram warning + são omitidas do SELECT.
 *   Required mínimas: cities(id,name,slug,state) + ads(id,status).
 *
 * Read-only. PII redactada. Sem alteração de produção.
 */

import "dotenv/config";

import { closeDatabasePool, pool } from "../../src/infrastructure/database/db.js";

import { detectMalformedCity } from "./lib/detect-malformed-city.mjs";
import {
  ALL_ADS_COLUMNS_FOR_CITY,
  ALL_CITIES_COLUMNS,
  buildAdCityJoinQuery,
  buildCitiesScanQuery,
  buildMissingCoordsQuery,
  buildOrphanAdsQuery,
} from "./lib/city-integrity-query-builder.mjs";
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

async function main() {
  const [adsColumns, citiesColumns] = await Promise.all([
    fetchExistingColumns(pool, "ads"),
    fetchExistingColumns(pool, "cities"),
  ]);

  if (args.printSchema) {
    printSchemaDiagnostic({
      table: "ads",
      available: adsColumns,
      requested: ALL_ADS_COLUMNS_FOR_CITY,
    });
    printSchemaDiagnostic({
      table: "cities",
      available: citiesColumns,
      requested: ALL_CITIES_COLUMNS,
    });
    return;
  }

  if (!args.silent) {
    /* eslint-disable-next-line no-console */
    console.log(
      `[audit-city-integrity] reading cities + ad joins (limit=${args.limit})…`
    );
  }

  const citiesScan = buildCitiesScanQuery({ availableColumns: citiesColumns, args });
  const adJoinBuild = buildAdCityJoinQuery({ adsColumns, citiesColumns, args });
  const orphanBuild = buildOrphanAdsQuery({ availableColumns: adsColumns, args });
  const missingCoordsBuild = buildMissingCoordsQuery({ availableColumns: citiesColumns });

  if (!args.silent) {
    if (citiesScan.missing.length > 0) {
      /* eslint-disable-next-line no-console */
      console.warn(
        `[audit-city-integrity] cities OPCIONAIS ausentes: ${citiesScan.missing.join(", ")}`
      );
    }
    if (adJoinBuild.adsMissing.length > 0) {
      /* eslint-disable-next-line no-console */
      console.warn(
        `[audit-city-integrity] ads OPCIONAIS ausentes: ${adJoinBuild.adsMissing.join(", ")}`
      );
    }
  }

  const [citiesRes, adJoinRes, orphanRes, missingCoordsRes] = await Promise.all([
    pool.query(citiesScan.sql, citiesScan.params),
    pool.query(adJoinBuild.sql, adJoinBuild.params),
    pool.query(orphanBuild.sql, orphanBuild.params),
    pool.query(missingCoordsBuild.sql, missingCoordsBuild.params),
  ]);

  const cities = citiesRes.rows;
  const adJoin = adJoinRes.rows;
  const orphans = orphanRes.rows;
  const missingCoords = missingCoordsRes.rows;

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
