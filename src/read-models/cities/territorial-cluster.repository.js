// src/read-models/cities/territorial-cluster.repository.js
//
// Queries de agregação EXATA por estoque ativo para as páginas de cluster
// cidade+marca[+modelo]. Diferente dos snapshots legados
// (`city-brand.repository.js`), estas agrupam por valor real de
// `ads.brand`/`ads.model` e devolvem `sum_price`/`last_updated` para que a
// camada de lógica (`territorial-cluster.logic.js`) resolva por slug e
// recompute média ponderada sem depender de match textual no SQL.

import { pool } from "../../infrastructure/database/db.js";

/** Identidade da cidade pelo slug canônico (`nome-uf`). Null se inexistente. */
export async function getCityIdentity(citySlug) {
  const result = await pool.query(
    `
    SELECT id, name, state, slug, stage
    FROM cities
    WHERE slug = $1
    LIMIT 1
    `,
    [citySlug]
  );

  return result.rows[0] || null;
}

/**
 * Agregados por MARCA real entre os anúncios ativos da cidade. Uma linha por
 * valor distinto de `ads.brand`. A resolução slug → marca é feita em JS.
 */
export async function getActiveBrandAggregates(cityId) {
  const result = await pool.query(
    `
    SELECT
      a.brand AS brand,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE a.highlight_until IS NOT NULL AND a.highlight_until > NOW())::int AS highlight,
      COUNT(*) FILTER (WHERE a.below_fipe = true)::int AS below_fipe,
      MIN(a.price) AS min_price,
      MAX(a.price) AS max_price,
      SUM(a.price) AS sum_price,
      MAX(a.updated_at) AS last_updated
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
      AND btrim(a.brand) <> ''
    GROUP BY a.brand
    `,
    [cityId]
  );

  return result.rows;
}

/**
 * Agregados por MODELO real entre os anúncios ativos da cidade restritos às
 * marcas reais informadas (já resolvidas pelo slug). `brandValues` é a lista
 * de strings reais de marca (ex.: ["Fiat"]). Comparação case-insensitive.
 */
export async function getActiveModelAggregates(cityId, brandValues) {
  const values = (Array.isArray(brandValues) ? brandValues : [])
    .map((v) =>
      String(v || "")
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);

  if (values.length === 0) return [];

  const result = await pool.query(
    `
    SELECT
      a.brand AS brand,
      a.model AS model,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE a.highlight_until IS NOT NULL AND a.highlight_until > NOW())::int AS highlight,
      COUNT(*) FILTER (WHERE a.below_fipe = true)::int AS below_fipe,
      MIN(a.price) AS min_price,
      MAX(a.price) AS max_price,
      SUM(a.price) AS sum_price,
      MIN(a.year) AS min_year,
      MAX(a.year) AS max_year,
      MAX(a.updated_at) AS last_updated
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND LOWER(a.brand) = ANY($2)
      AND a.model IS NOT NULL
      AND btrim(a.model) <> ''
    GROUP BY a.brand, a.model
    `,
    [cityId, values]
  );

  return result.rows;
}
