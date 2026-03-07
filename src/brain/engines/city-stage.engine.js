import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

function resolveCityStage({
  totalAds,
  totalLeads,
  dominanceScore,
  opportunityScore,
}) {
  if (dominanceScore >= 120 && totalAds >= 80) return "dominance";
  if (opportunityScore >= 80 || totalLeads >= 20 || totalAds >= 40) return "expansion";
  if (opportunityScore >= 40 || totalAds >= 10) return "seed";
  return "discovery";
}

export async function runCityStageEngine(limit = 500) {
  const safeLimit = Math.min(5500, Math.max(1, Number(limit) || 500));

  logger.info({ safeLimit }, "[brain.city-stage] Iniciando classificação de estágios");

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.stage,
      COALESCE(cd.total_ads, 0) AS total_ads,
      COALESCE(cd.leads, 0) AS total_leads,
      COALESCE(cd.dominance_score, 0) AS dominance_score,
      COALESCE(co.opportunity_score, 0) AS opportunity_score
    FROM cities c
    LEFT JOIN city_dominance cd ON cd.city_id = c.id
    LEFT JOIN city_opportunities co ON co.city_id = c.id
    ORDER BY c.id ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  for (const row of result.rows) {
    const nextStage = resolveCityStage({
      totalAds: Number(row.total_ads || 0),
      totalLeads: Number(row.total_leads || 0),
      dominanceScore: Number(row.dominance_score || 0),
      opportunityScore: Number(row.opportunity_score || 0),
    });

    if (row.stage === nextStage) {
      continue;
    }

    await pool.query(
      `
      UPDATE cities
      SET stage = $2,
          updated_at = NOW()
      WHERE id = $1
      `,
      [row.id, nextStage]
    );

    logger.info(
      {
        cityId: row.id,
        previousStage: row.stage,
        nextStage,
      },
      "[brain.city-stage] Estágio da cidade atualizado"
    );
  }

  logger.info("[brain.city-stage] Classificação de estágios finalizada");
}
