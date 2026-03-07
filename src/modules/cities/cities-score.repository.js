import { pool } from "../../infrastructure/database/db.js";

export async function upsertCityScore({
  cityId,
  demandScore = 0,
  dominanceScore = 0,
  opportunityScore = 0,
  predictionScore = 0,
  totalAds = 0,
  totalLeads = 0,
  totalDealers = 0,
  stage = "discovery",
  territorialScore = 0,
  rankingPriority = 0,
}) {
  await pool.query(
    `
    INSERT INTO city_scores (
      city_id,
      demand_score,
      dominance_score,
      opportunity_score,
      prediction_score,
      total_ads,
      total_leads,
      total_dealers,
      stage,
      territorial_score,
      ranking_priority,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (city_id)
    DO UPDATE SET
      demand_score = EXCLUDED.demand_score,
      dominance_score = EXCLUDED.dominance_score,
      opportunity_score = EXCLUDED.opportunity_score,
      prediction_score = EXCLUDED.prediction_score,
      total_ads = EXCLUDED.total_ads,
      total_leads = EXCLUDED.total_leads,
      total_dealers = EXCLUDED.total_dealers,
      stage = EXCLUDED.stage,
      territorial_score = EXCLUDED.territorial_score,
      ranking_priority = EXCLUDED.ranking_priority,
      updated_at = NOW()
    `,
    [
      cityId,
      demandScore,
      dominanceScore,
      opportunityScore,
      predictionScore,
      totalAds,
      totalLeads,
      totalDealers,
      stage,
      territorialScore,
      rankingPriority,
    ]
  );
}

export async function listCitiesForScoring(limit = 1000) {
  const safeLimit = Math.min(6000, Math.max(1, Number(limit) || 1000));

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.state,
      c.slug,
      c.stage,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COALESCE(cm.total_leads, 0) AS metric_total_leads,
      COALESCE(cm.total_ads, 0) AS metric_total_ads,
      COALESCE(cm.total_dealers, 0) AS metric_total_dealers,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS dominance_total_ads,
      COALESCE(cd.leads, 0) AS dominance_total_leads,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(cp.prediction_score, 0) AS prediction_score
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN city_predictions cp ON cp.city_id = c.id
    ORDER BY c.id ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function listTopRankedCities(limit = 100) {
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 100));

  const result = await pool.query(
    `
    SELECT
      cs.city_id,
      c.name,
      c.state,
      c.slug,
      cs.stage,
      cs.demand_score,
      cs.dominance_score,
      cs.opportunity_score,
      cs.prediction_score,
      cs.total_ads,
      cs.total_leads,
      cs.total_dealers,
      cs.territorial_score,
      cs.ranking_priority,
      cs.updated_at
    FROM city_scores cs
    JOIN cities c ON c.id = cs.city_id
    ORDER BY
      cs.ranking_priority DESC,
      cs.territorial_score DESC,
      cs.opportunity_score DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function getCityScoreBySlug(slug) {
  const result = await pool.query(
    `
    SELECT
      cs.city_id,
      c.name,
      c.state,
      c.slug,
      cs.stage,
      cs.demand_score,
      cs.dominance_score,
      cs.opportunity_score,
      cs.prediction_score,
      cs.total_ads,
      cs.total_leads,
      cs.total_dealers,
      cs.territorial_score,
      cs.ranking_priority,
      cs.updated_at
    FROM city_scores cs
    JOIN cities c ON c.id = cs.city_id
    WHERE c.slug = $1
    LIMIT 1
    `,
    [slug]
  );

  return result.rows[0] || null;
}
