import { pool } from "../../infrastructure/database/db.js";

export async function listTopOpportunities(limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT
      c.id AS city_id,
      c.name,
      c.state,
      c.slug,
      c.stage,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level,
      CASE COALESCE(co.priority_level, 'low')
        WHEN 'critical' THEN 'alta'
        WHEN 'high' THEN 'alta'
        WHEN 'medium' THEN 'media'
        ELSE 'baixa'
      END AS growth_tier_pt,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS total_leads
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    ORDER BY
      COALESCE(co.opportunity_score, 0) DESC,
      COALESCE(cm.demand_score, 0) DESC,
      COALESCE(cd.dominance_score, 0) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function getCityOpportunityBySlug(slug) {
  const result = await pool.query(
    `
    SELECT
      c.id AS city_id,
      c.name,
      c.state,
      c.slug,
      c.stage,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level,
      CASE COALESCE(co.priority_level, 'low')
        WHEN 'critical' THEN 'alta'
        WHEN 'high' THEN 'alta'
        WHEN 'medium' THEN 'media'
        ELSE 'baixa'
      END AS growth_tier_pt,
      COALESCE(co.demand_index, 0) AS demand_index,
      COALESCE(co.supply_index, 0) AS supply_index,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS total_leads,
      COALESCE(cd.avg_ctr, 0) AS avg_ctr
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    WHERE c.slug = $1
    LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] || null;
}

export async function listCityOpportunitySignals(limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));

  const result = await pool.query(
    `
    SELECT
      c.id AS city_id,
      c.slug,
      c.name,
      c.state,
      c.stage,
      COALESCE(co.priority_level, 'low') AS priority_level,
      CASE COALESCE(co.priority_level, 'low')
        WHEN 'critical' THEN 'alta'
        WHEN 'high' THEN 'alta'
        WHEN 'medium' THEN 'media'
        ELSE 'baixa'
      END AS growth_tier_pt,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(cp.prediction_label, 'cold') AS prediction_label,
      COALESCE(cp.prediction_score, 0) AS prediction_score
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN city_predictions cp ON cp.city_id = c.id
    ORDER BY
      COALESCE(co.opportunity_score, 0) DESC,
      COALESCE(cp.prediction_score, 0) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
