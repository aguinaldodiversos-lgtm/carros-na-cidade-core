import { pool } from "../../infrastructure/database/db.js";

export async function getCityOpportunitySnapshot(citySlug) {
  const result = await pool.query(
    `
    SELECT
      c.id AS city_id,
      c.name AS city_name,
      c.state AS city_state,
      c.slug AS city_slug,
      c.stage AS city_stage,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level,
      COALESCE(co.demand_index, 0) AS demand_index,
      COALESCE(co.supply_index, 0) AS supply_index,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS total_leads
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    WHERE c.slug = $1
    LIMIT 1
    `,
    [citySlug]
  );

  return result.rows[0] || null;
}

export async function listCityBelowFipeAds(citySlug, limit = 24) {
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
      a.created_at
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1
      AND a.status = 'active'
      AND a.below_fipe = true
    ORDER BY a.created_at DESC, a.price ASC NULLS LAST
    LIMIT $2
    `,
    [citySlug, safeLimit]
  );

  return result.rows;
}
