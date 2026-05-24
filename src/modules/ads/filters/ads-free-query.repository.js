// src/modules/ads/filters/ads-free-query.repository.js

import { pool } from "../../../infrastructure/database/db.js";
import { AD_STATUS } from "../ads.canonical.constants.js";
import { DIRTY_AD_FIELDS_SQL } from "./ads-filter.builder.js";

/**
 * Filtro de dados sujos aplicado aos DICIONÁRIOS de brand/model do
 * free-query parser. Mesmo princípio do autocomplete (briefing P0
 * 2026-05-25): o parser usa esses dicionários para inferir filtros do
 * texto livre — se "TEST" estiver na lista de marcas, ele pode
 * "reconhecer" e propor um filtro inútil.
 *
 * DIRTY_AD_FIELDS_SQL exige alias `a` na tabela `ads`. Refatorei os
 * 2 SELECTs abaixo para usar `FROM ads a` + `a.brand`/`a.model`/
 * `a.status` — drop-in, mesmo plano de execução.
 */
const DIRTY_FREE_QUERY_FILTER = `AND ${DIRTY_AD_FIELDS_SQL}`;

export async function loadBrandDictionary(limit = 300) {
  const result = await pool.query(
    `
    SELECT a.brand, COUNT(*)::int AS total
    FROM ads a
    WHERE a.status = '${AD_STATUS.ACTIVE}'
      AND a.brand IS NOT NULL
      ${DIRTY_FREE_QUERY_FILTER}
    GROUP BY a.brand
    ORDER BY total DESC, a.brand ASC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

export async function loadModelDictionary(limit = 1500) {
  const result = await pool.query(
    `
    SELECT a.brand, a.model, COUNT(*)::int AS total
    FROM ads a
    WHERE a.status = '${AD_STATUS.ACTIVE}'
      AND a.brand IS NOT NULL
      AND a.model IS NOT NULL
      ${DIRTY_FREE_QUERY_FILTER}
    GROUP BY a.brand, a.model
    ORDER BY total DESC, a.brand ASC, a.model ASC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

export async function loadCityDictionary(limit = 3000) {
  const result = await pool.query(
    `
    SELECT id, name, slug, state
    FROM cities
    ORDER BY name ASC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}
