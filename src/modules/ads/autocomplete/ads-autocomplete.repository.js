// src/modules/ads/autocomplete/ads-autocomplete.repository.js

import { pool } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { AD_STATUS } from "../ads.canonical.constants.js";

/* =====================================================
   DICTIONARIES
===================================================== */

export async function loadBrandDictionary(limit = 400) {
  const safeLimit = Math.min(2000, Math.max(50, Number(limit) || 400));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      COUNT(*)::int AS total
    FROM ads a
    WHERE a.status = '${AD_STATUS.ACTIVE}'
      AND a.brand IS NOT NULL
    GROUP BY a.brand
    ORDER BY total DESC, a.brand ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function loadModelDictionary(limit = 2500) {
  const safeLimit = Math.min(10000, Math.max(100, Number(limit) || 2500));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      a.model,
      COUNT(*)::int AS total
    FROM ads a
    WHERE a.status = '${AD_STATUS.ACTIVE}'
      AND a.brand IS NOT NULL
      AND a.model IS NOT NULL
    GROUP BY a.brand, a.model
    ORDER BY total DESC, a.brand ASC, a.model ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function loadCityDictionary(limit = 4000) {
  const safeLimit = Math.min(10000, Math.max(100, Number(limit) || 4000));

  try {
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.state,
        COALESCE(cs.ranking_priority, 0) AS ranking_priority,
        COALESCE(cs.territorial_score, 0) AS territorial_score
      FROM cities c
      LEFT JOIN city_scores cs ON cs.city_id = c.id
      ORDER BY
        COALESCE(cs.ranking_priority, 0) DESC,
        COALESCE(cs.territorial_score, 0) DESC,
        c.name ASC
      LIMIT $1
      `,
      [safeLimit]
    );

    return result.rows;
  } catch (err) {
    logger.warn(
      { err: err?.message || String(err) },
      "[ads-autocomplete] loadCityDictionary: fallback sem city_scores"
    );
    const result = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.slug,
        c.state,
        0::int AS ranking_priority,
        0::int AS territorial_score
      FROM cities c
      ORDER BY c.name ASC
      LIMIT $1
      `,
      [safeLimit]
    );
    return result.rows;
  }
}

export async function loadCityBrandPresence(limit = 5000) {
  const safeLimit = Math.min(20000, Math.max(100, Number(limit) || 5000));

  const result = await pool.query(
    `
    SELECT
      c.slug AS city_slug,
      c.name AS city_name,
      c.state AS city_state,
      a.brand,
      COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE a.status = '${AD_STATUS.ACTIVE}'
      AND a.brand IS NOT NULL
    GROUP BY c.slug, c.name, c.state, a.brand
    ORDER BY total DESC, c.name ASC, a.brand ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
