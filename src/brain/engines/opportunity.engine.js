import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

function calculateOpportunityScore({
  buscas = 0,
  alertas = 0,
  totalAnuncios = 0,
  concorrentesEstimados = 0,
}) {
  const demandScore = buscas * 0.5 + alertas * 2;
  const supplyPenalty = totalAnuncios * 0.8;
  const competitionPenalty = concorrentesEstimados * 1.2;

  const score = demandScore - supplyPenalty - competitionPenalty + 50;

  return Math.max(0, Number(score.toFixed(2)));
}

function classifyOpportunity(score) {
  if (score >= 120) return "critical";
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export async function runOpportunityEngine() {
  logger.info("[brain.opportunity] Iniciando avaliação territorial");

  const citiesResult = await pool.query(`
    SELECT id
    FROM cities
    ORDER BY id ASC
  `);

  for (const city of citiesResult.rows) {
    const cityId = city.id;

    const [demandResult, supplyResult] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*)::int AS demand
        FROM alerts
        WHERE city_id = $1
        `,
        [cityId]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS supply
        FROM ads
        WHERE city_id = $1
          AND status = 'active'
        `,
        [cityId]
      ),
    ]);

    const alertDemand = Number(demandResult.rows[0]?.demand || 0);
    const supply = Number(supplyResult.rows[0]?.supply || 0);

    const concorrenciaEstimado = 10;

    const score = calculateOpportunityScore({
      buscas: 0,
      alertas: alertDemand,
      totalAnuncios: supply,
      concorrentesEstimados: concorrenciaEstimado,
    });

    const priority = classifyOpportunity(score);

    await pool.query(
      `
      INSERT INTO city_opportunities (
        city_id,
        demand_index,
        supply_index,
        opportunity_score,
        priority_level,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        demand_index = EXCLUDED.demand_index,
        supply_index = EXCLUDED.supply_index,
        opportunity_score = EXCLUDED.opportunity_score,
        priority_level = EXCLUDED.priority_level,
        updated_at = NOW()
      `,
      [cityId, alertDemand, supply, score, priority]
    );

    logger.info(
      {
        cityId,
        score,
        priority,
        demand: alertDemand,
        supply,
      },
      "[brain.opportunity] Cidade avaliada"
    );
  }

  logger.info("[brain.opportunity] Avaliação territorial finalizada");
}
