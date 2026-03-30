import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

/**
 * Score de oportunidade territorial (única fonte para city_opportunities).
 * Componentes:
 * - Demanda: alertas de interesse + demanda de busca (city_metrics.demand_score)
 * - Oferta: volume de anúncios ativos
 * - Concorrência: anunciantes distintos com estoque ativo na cidade
 */

function calculateOpportunityScore({ demandSignal = 0, supply = 0, competition = 0 }) {
  const supplyPenalty = Math.min(180, supply * 0.45);
  const competitionPenalty = Math.min(140, competition * 2.8);
  const score = demandSignal - supplyPenalty * 0.55 - competitionPenalty * 0.45 + 48;

  return Math.max(0, Number(score.toFixed(2)));
}

function classifyOpportunity(score) {
  if (score >= 120) return "critical";
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function mapPriorityToPtTier(priority) {
  if (priority === "critical" || priority === "high") return "alta";
  if (priority === "medium") return "media";
  return "baixa";
}

function buildDemandSignal(alertDemand, searchDemand) {
  const alerts = Number(alertDemand || 0);
  const search = Number(searchDemand || 0);
  return Math.min(200, alerts * 2.1 + search * 0.42);
}

export async function runOpportunityEngine() {
  logger.info(
    "[brain.opportunity] Iniciando avaliação territorial (demanda / oferta / concorrência)"
  );

  const citiesResult = await pool.query(`
    SELECT id
    FROM cities
    ORDER BY id ASC
  `);

  for (const city of citiesResult.rows) {
    const cityId = city.id;

    const [metricsResult, alertsResult, supplyResult, competitionResult] = await Promise.all([
      pool.query(
        `
        SELECT COALESCE(cm.demand_score, 0)::float AS search_demand
        FROM city_metrics cm
        WHERE cm.city_id = $1
        LIMIT 1
        `,
        [cityId]
      ),
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
      pool.query(
        `
        SELECT COUNT(DISTINCT advertiser_id)::int AS competitors
        FROM ads
        WHERE city_id = $1
          AND status = 'active'
          AND advertiser_id IS NOT NULL
        `,
        [cityId]
      ),
    ]);

    const searchDemand = Number(metricsResult.rows[0]?.search_demand || 0);
    const alertDemand = Number(alertsResult.rows[0]?.demand || 0);
    const supply = Number(supplyResult.rows[0]?.supply || 0);
    const competition = Number(competitionResult.rows[0]?.competitors || 0);

    const demandSignal = buildDemandSignal(alertDemand, searchDemand);
    const score = calculateOpportunityScore({
      demandSignal,
      supply,
      competition,
    });

    const priority = classifyOpportunity(score);
    const growthTierPt = mapPriorityToPtTier(priority);

    const paramsExtended = [
      cityId,
      alertDemand,
      supply,
      score,
      priority,
      competition,
      searchDemand,
      growthTierPt,
    ];

    const sqlExtended = `
      INSERT INTO city_opportunities (
        city_id,
        demand_index,
        supply_index,
        opportunity_score,
        priority_level,
        competition_index,
        demand_score_used,
        growth_tier_pt,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        demand_index = EXCLUDED.demand_index,
        supply_index = EXCLUDED.supply_index,
        opportunity_score = EXCLUDED.opportunity_score,
        priority_level = EXCLUDED.priority_level,
        competition_index = EXCLUDED.competition_index,
        demand_score_used = EXCLUDED.demand_score_used,
        growth_tier_pt = EXCLUDED.growth_tier_pt,
        updated_at = NOW()
    `;

    const sqlCore = `
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
    `;

    try {
      await pool.query(sqlExtended, paramsExtended);
    } catch (err) {
      if (err?.code !== "42703") {
        throw err;
      }
      await pool.query(sqlCore, [cityId, alertDemand, supply, score, priority]);
    }

    logger.info(
      {
        cityId,
        score,
        priority,
        growthTierPt,
        demandAlerts: alertDemand,
        demandSearch: searchDemand,
        supply,
        competition,
      },
      "[brain.opportunity] Cidade avaliada"
    );
  }

  logger.info("[brain.opportunity] Avaliação territorial finalizada");
}
