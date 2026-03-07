import { pool } from "../../infrastructure/database/db.js";

export async function getCityBrandSnapshot(citySlug, brand) {
  const result = await pool.query(
    `
    SELECT
      c.id AS city_id,
      c.name AS city_name,
      c.state AS city_state,
      c.slug AS city_slug,
      c.stage AS city_stage,
      $2::text AS brand,
      COUNT(a.id)::int AS total_ads,
      COUNT(a.id) FILTER (
        WHERE a.highlight_until IS NOT NULL
          AND a.highlight_until > NOW()
      )::int AS total_highlight_ads,
      COUNT(a.id) FILTER (
        WHERE a.below_fipe = true
      )::int AS total_below_fipe_ads,
      MIN(a.price) AS min_price,
      MAX(a.price) AS max_price,
      ROUND(AVG(a.price)) AS avg_price
    FROM cities c
    LEFT JOIN ads a
      ON a.city_id = c.id
     AND a.status = 'active'
     AND LOWER(a.brand) = LOWER($2)
    WHERE c.slug = $1
    GROUP BY c.id, c.name, c.state, c.slug, c.stage
    LIMIT 1
    `,
    [citySlug, brand]
  );

  return result.rows[0] || null;
}

export async function listBrandAds(citySlug, brand, limit = 24) {
  const safeLimit = Math.min(60, Math.max(1, Number(limit) || 24));

  const result = await pool.query(
    `
    SELECT
      a.id,
      a.title,
      a.price,
      a.city,
      a.state,
      a.brand,
      a.model,
      a.year,
      a.mileage,
      a.slug,
      a.plan,
      a.below_fipe,
      a.highlight_until,
      a.created_at
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND LOWER(a.brand) = LOWER($2)
    ORDER BY
      (CASE WHEN a.highlight_until > NOW() THEN 1 ELSE 0 END) DESC,
      a.priority DESC NULLS LAST,
      a.created_at DESC
    LIMIT $3
    `,
    [citySlug, brand, safeLimit]
  );

  return result.rows;
}

export async function listBrandModels(citySlug, brand, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      a.model,
      COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND LOWER(a.brand) = LOWER($2)
      AND a.model IS NOT NULL
    GROUP BY a.model
    ORDER BY total DESC, a.model ASC
    LIMIT $3
    `,
    [citySlug, brand, safeLimit]
  );

  return result.rows;
}

export async function listRelatedBrands(citySlug, limit = 12) {
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 12));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
    GROUP BY a.brand
    ORDER BY total DESC, a.brand ASC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}
