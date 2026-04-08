/**
 * Pipeline único de crescimento: métricas → oportunidade por cidade → scores → filas de ação.
 * Evita duplicar lógica entre `growth/growth-brain.worker.js` e `growth/opportunity.worker.js`.
 */
import os from "os";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { runOpportunityEngine } from "../../brain/engines/opportunity.engine.js";
import { rebuildCityScores } from "../cities/cities-score.service.js";
import {
  planCityGrowthActions,
  planOpportunityTierActions,
} from "./growth-city-actions.planner.js";
import { refreshAdMetricsTable } from "../../workers/ad-metrics.refresh.js";

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

async function refreshAdMetrics() {
  await refreshAdMetricsTable(pool);
}

async function upsertCityDominanceTop(limit = 50) {
  const lim = clampInt(limit, 5, 200);

  await pool.query(
    `
    INSERT INTO city_dominance (city_id, dominance_score, leads, avg_ctr, total_ads, updated_at)
    SELECT
      c.id,
      (
        (COUNT(e.id) FILTER (WHERE e.event_type='lead') * 5)
        + (COALESCE(AVG(m.ctr),0) * 100)
        + COUNT(a.id)
        + COALESCE(cm.demand_score,0)
      ) AS dominance_score,
      COUNT(e.id) FILTER (WHERE e.event_type='lead') AS leads,
      COALESCE(AVG(m.ctr),0) AS avg_ctr,
      COUNT(a.id) AS total_ads,
      NOW()
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN ads a ON a.city_id = c.id AND a.status='active'
    LEFT JOIN ad_events e ON e.ad_id = a.id
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    GROUP BY c.id, cm.demand_score
    ORDER BY dominance_score DESC
    LIMIT $1
    ON CONFLICT (city_id)
    DO UPDATE SET
      dominance_score = EXCLUDED.dominance_score,
      leads = EXCLUDED.leads,
      avg_ctr = EXCLUDED.avg_ctr,
      total_ads = EXCLUDED.total_ads,
      updated_at = NOW()
    `,
    [lim]
  );
}

async function upsertLearningModelTop(limit = 300) {
  const lim = clampInt(limit, 50, 2000);

  await pool.query(
    `
    INSERT INTO learning_model (city_id, model, avg_ctr, leads, updated_at)
    SELECT
      a.city_id,
      a.model,
      COALESCE(AVG(m.ctr),0) AS avg_ctr,
      COUNT(e.id) FILTER (WHERE e.event_type='lead') AS leads,
      NOW()
    FROM ads a
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    LEFT JOIN ad_events e ON e.ad_id = a.id
    WHERE a.status='active' AND a.model IS NOT NULL
    GROUP BY a.city_id, a.model
    ORDER BY leads DESC, avg_ctr DESC
    LIMIT $1
    ON CONFLICT (city_id, model)
    DO UPDATE SET
      avg_ctr = EXCLUDED.avg_ctr,
      leads = EXCLUDED.leads,
      updated_at = NOW()
    `,
    [lim]
  );
}

async function enqueueUpgradeOffers() {
  await pool.query(
    `
    INSERT INTO notification_queue (user_id, type, payload, status, created_at)
    SELECT
      a.user_id,
      'upgrade_offer',
      jsonb_build_object(
        'city_id', a.city_id,
        'reason', 'Cidade com alta dominância/alta demanda',
        'message', 'Sua cidade está aquecida. Quer impulsionar seus anúncios e aparecer em destaque? Toque para ver os planos.'
      ),
      'pending',
      NOW()
    FROM advertisers a
    JOIN city_dominance cd ON cd.city_id = a.city_id
    WHERE a.user_id IS NOT NULL
      AND cd.dominance_score >= 80
      AND NOT EXISTS (
        SELECT 1 FROM notification_queue n
        WHERE n.user_id = a.user_id
          AND n.type = 'upgrade_offer'
          AND n.created_at > NOW() - INTERVAL '7 days'
          AND n.status IN ('pending','sent','opened')
      )
    `
  );
}

/**
 * Ciclo completo usado pelo Growth Brain (worker).
 * @param {object} [opts]
 * @param {number} [opts.dominanceLimit]
 * @param {number} [opts.learningLimit]
 * @param {number} [opts.scoreRebuildLimit]
 * @param {number} [opts.cityActionsLimit]
 * @param {number} [opts.opportunityTierLimit]
 */
export async function runGrowthBrainPipeline(opts = {}) {
  const instance = process.env.INSTANCE_ID || os.hostname();
  const dominanceLimit = opts.dominanceLimit ?? 80;
  const learningLimit = opts.learningLimit ?? 800;
  const scoreRebuildLimit = opts.scoreRebuildLimit ?? 2000;
  const cityActionsLimit = opts.cityActionsLimit ?? 12;
  const opportunityTierLimit = opts.opportunityTierLimit ?? 15;

  logger.info({ message: "🧠 Growth Brain / Autopilot — pipeline iniciando", instance });

  await refreshAdMetrics();
  await upsertCityDominanceTop(dominanceLimit);
  await upsertLearningModelTop(learningLimit);

  await runOpportunityEngine();
  await rebuildCityScores(scoreRebuildLimit);

  await planCityGrowthActions(cityActionsLimit);
  await planOpportunityTierActions(opportunityTierLimit);

  await enqueueUpgradeOffers();

  logger.info({ message: "✅ Growth Brain / Autopilot — pipeline finalizado", instance });
}

/**
 * Rodada leve: só recalcula oportunidade + city_scores (worker de oportunidade).
 * O pipeline completo permanece no Growth Brain.
 */
export async function runOpportunityScoringOnly() {
  await runOpportunityEngine();
  await rebuildCityScores(2000);
}
