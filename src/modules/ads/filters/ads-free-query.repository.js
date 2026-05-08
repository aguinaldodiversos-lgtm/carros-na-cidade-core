// src/modules/ads/filters/ads-free-query.repository.js

import { pool } from "../../../infrastructure/database/db.js";
import { AD_STATUS } from "../ads.canonical.constants.js";

export async function loadBrandDictionary(limit = 300) {
  const result = await pool.query(
    `
    SELECT brand, COUNT(*)::int AS total
    FROM ads
    WHERE status = '${AD_STATUS.ACTIVE}'
      AND brand IS NOT NULL
    GROUP BY brand
    ORDER BY total DESC, brand ASC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}

export async function loadModelDictionary(limit = 1500) {
  const result = await pool.query(
    `
    SELECT brand, model, COUNT(*)::int AS total
    FROM ads
    WHERE status = '${AD_STATUS.ACTIVE}'
      AND brand IS NOT NULL
      AND model IS NOT NULL
    GROUP BY brand, model
    ORDER BY total DESC, brand ASC, model ASC
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
