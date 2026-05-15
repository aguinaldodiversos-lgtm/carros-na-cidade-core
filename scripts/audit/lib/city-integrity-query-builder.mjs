/**
 * Builders puros de SQL para audit-production-city-integrity.mjs.
 *
 * Estrutura idêntica ao ads-query-builder: REQUIRED vs OPTIONAL, com
 * SELECT dinâmico baseado em `information_schema.columns`. Erro cedo se
 * faltar coluna REQUIRED, warning se faltar OPTIONAL.
 */

import { buildSafeColumnList } from "./audit-shared.mjs";

export const REQUIRED_CITIES_COLUMNS = ["id", "name", "slug", "state"];
export const OPTIONAL_CITIES_COLUMNS = ["latitude", "longitude"];
export const ALL_CITIES_COLUMNS = [...REQUIRED_CITIES_COLUMNS, ...OPTIONAL_CITIES_COLUMNS];

export const REQUIRED_ADS_BASE_COLUMNS = ["id", "status"];
export const OPTIONAL_ADS_COLUMNS_FOR_CITY = [
  "title",
  "city",
  "state",
  "city_id",
  "created_at",
];
export const ALL_ADS_COLUMNS_FOR_CITY = [
  ...REQUIRED_ADS_BASE_COLUMNS,
  ...OPTIONAL_ADS_COLUMNS_FOR_CITY,
];

function aliasCols(cols, alias) {
  return cols.map((c) => `${alias}.${c}`);
}

export function buildCitiesScanQuery({ availableColumns, args }) {
  const { present, missing } = buildSafeColumnList(availableColumns, ALL_CITIES_COLUMNS);

  for (const req of REQUIRED_CITIES_COLUMNS) {
    if (!present.includes(req)) {
      throw new Error(
        `[audit-city-integrity] tabela cities sem coluna obrigatória '${req}'. Rode --print-schema.`
      );
    }
  }

  const sql = `
    SELECT ${present.join(", ")}
    FROM cities
    ORDER BY name ASC
    LIMIT $1
  `.trim();

  return { sql, params: [args.limit], present, missing };
}

export function buildAdCityJoinQuery({ adsColumns, citiesColumns, args }) {
  const { present: adsPresent, missing: adsMissing } = buildSafeColumnList(
    adsColumns,
    ALL_ADS_COLUMNS_FOR_CITY
  );
  const { present: citiesPresent, missing: citiesMissing } = buildSafeColumnList(
    citiesColumns,
    ALL_CITIES_COLUMNS
  );

  for (const req of REQUIRED_ADS_BASE_COLUMNS) {
    if (!adsPresent.includes(req)) {
      throw new Error(
        `[audit-city-integrity] tabela ads sem coluna obrigatória '${req}'. Rode --print-schema.`
      );
    }
  }

  const adsSelect = aliasCols(adsPresent, "a")
    .map((qualified) => {
      const col = qualified.slice(2);
      return `${qualified} AS ad_${col}`;
    })
    .join(", ");

  // city_* columns from join (LEFT JOIN para preservar ads sem city_id)
  const citiesSelect = aliasCols(citiesPresent, "c")
    .map((qualified) => {
      const col = qualified.slice(2);
      return `${qualified} AS city_${col}`;
    })
    .join(", ");

  const where = [];
  const params = [];
  if (args.statusFilter && adsPresent.includes("status")) {
    params.push(args.statusFilter);
    where.push(`a.status = $${params.length}`);
  }
  params.push(args.limit);
  const limitPos = params.length;
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = adsPresent.includes("created_at") ? "ORDER BY a.created_at DESC" : "";

  // Só inclui JOIN com cities se a coluna city_id existir na ads.
  const join = adsPresent.includes("city_id")
    ? "LEFT JOIN cities c ON c.id = a.city_id"
    : "LEFT JOIN cities c ON FALSE";

  const selectFinal = [adsSelect, citiesSelect].filter(Boolean).join(", ");

  const sql = `
    SELECT ${selectFinal}
    FROM ads a
    ${join}
    ${whereClause}
    ${orderBy}
    LIMIT $${limitPos}
  `.trim();

  return {
    sql,
    params,
    adsPresent,
    adsMissing,
    citiesPresent,
    citiesMissing,
  };
}

export function buildOrphanAdsQuery({ availableColumns, args }) {
  if (!availableColumns.has("city_id")) {
    // Sem city_id, não há conceito de "ad órfão de cidade" — devolve query
    // que retorna zero linhas para o caller seguir simples.
    return { sql: `SELECT NULL::int AS id WHERE FALSE`, params: [] };
  }

  const titleCol = availableColumns.has("title") ? ", a.title" : "";
  const cityCol = availableColumns.has("city") ? ", a.city" : "";
  const stateCol = availableColumns.has("state") ? ", a.state" : "";
  const statusCol = availableColumns.has("status") ? ", a.status" : "";
  const createdCol = availableColumns.has("created_at") ? ", a.created_at" : "";

  const params = [];
  let where = "a.city_id IS NULL";
  if (args.statusFilter && availableColumns.has("status")) {
    params.push(args.statusFilter);
    where = `${where} AND a.status = $${params.length}`;
  }

  const orderBy = availableColumns.has("created_at") ? "ORDER BY a.created_at DESC" : "";

  const sql = `
    SELECT a.id${titleCol}${cityCol}${stateCol}${statusCol}${createdCol}
    FROM ads a
    WHERE ${where}
    ${orderBy}
    LIMIT 500
  `.trim();

  return { sql, params };
}

export function buildMissingCoordsQuery({ availableColumns }) {
  if (!availableColumns.has("latitude") || !availableColumns.has("longitude")) {
    // Sem colunas geo, nada para auditar — devolve query trivial.
    return { sql: `SELECT NULL::int AS id WHERE FALSE`, params: [] };
  }
  const sql = `
    SELECT id, name, slug, state
    FROM cities
    WHERE latitude IS NULL OR longitude IS NULL
    ORDER BY name ASC
    LIMIT 200
  `.trim();
  return { sql, params: [] };
}
