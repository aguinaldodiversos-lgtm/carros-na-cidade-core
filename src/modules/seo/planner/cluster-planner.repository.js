import { pool } from "../../../infrastructure/database/db.js";

export async function listTopCitiesForClusterPlanning(limit = 200) {
  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 200));

  const result = await pool.query(
    `
    SELECT
      cs.city_id,
      c.name,
      c.state,
      c.slug,
      cs.stage,
      cs.territorial_score,
      cs.ranking_priority,
      cs.total_ads,
      cs.total_leads
    FROM city_scores cs
    JOIN cities c ON c.id = cs.city_id
    ORDER BY
      cs.ranking_priority DESC,
      cs.territorial_score DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function listTopBrandsByCity(cityId, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      COUNT(*)::int AS total
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
    GROUP BY a.brand
    ORDER BY total DESC, a.brand ASC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}

export async function listTopModelsByCityAndBrand(cityId, brand, limit = 8) {
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 8));

  const result = await pool.query(
    `
    SELECT
      a.model,
      COUNT(*)::int AS total
    FROM ads a
    WHERE a.city_id = $1
      AND a.status = 'active'
      AND LOWER(a.brand) = LOWER($2)
      AND a.model IS NOT NULL
    GROUP BY a.model
    ORDER BY total DESC, a.model ASC
    LIMIT $3
    `,
    [cityId, brand, safeLimit]
  );

  return result.rows;
}
