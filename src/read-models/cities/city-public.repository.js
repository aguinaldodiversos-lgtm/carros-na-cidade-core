import { pool } from "../../infrastructure/database/db.js";

export async function getCityPublicSnapshot(slug) {
  const result = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.state,
      c.slug,
      c.stage,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS total_leads,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    WHERE c.slug = $1
    LIMIT $1
    `,
    [slug]
  );

  return result.rows[0] || null;
}

export async function listCityHighlightAds(citySlug, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

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
      a.highlight_until,
      a.plan
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.highlight_until IS NOT NULL
      AND a.highlight_until > NOW()
    ORDER BY a.highlight_until DESC, a.created_at DESC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

export async function listCityOpportunityAds(citySlug, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

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
      a.below_fipe
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.below_fipe = true
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

export async function listRecentCityAds(citySlug, limit = 12) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));

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
      a.created_at
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
    ORDER BY a.created_at DESC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}

export async function listCityBrandFacets(citySlug, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

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

export async function listCityModelFacets(citySlug, limit = 20) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      a.brand,
      a.model,
      COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.brand IS NOT NULL
      AND a.model IS NOT NULL
    GROUP BY a.brand, a.model
    ORDER BY total DESC, a.brand ASC, a.model ASC
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}
