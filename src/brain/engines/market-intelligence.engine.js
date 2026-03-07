import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

export async function generateMarketIntelligence() {
  logger.info("[brain.market] Iniciando inteligência de mercado");

  const opportunitiesResult = await pool.query(`
    SELECT
      c.id AS city_id,
      c.name,
      c.slug,
      COALESCE(co.opportunity_score, 0) AS opportunity_score,
      COALESCE(co.priority_level, 'low') AS priority_level,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS leads
    FROM cities c
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    ORDER BY
      COALESCE(co.opportunity_score, 0) DESC,
      COALESCE(cd.dominance_score, 0) DESC
    LIMIT 50
  `);

  const opportunities = opportunitiesResult.rows;

  logger.info(
    {
      total: opportunities.length,
    },
    "[brain.market] Inteligência de mercado finalizada"
  );

  return {
    generatedAt: new Date().toISOString(),
    opportunities,
  };
}
