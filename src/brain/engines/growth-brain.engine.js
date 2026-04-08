import os from "os";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
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

async function enqueueJob(jobType, payload, priority = 3) {
  await pool.query(
    `
    INSERT INTO growth_jobs (job_type, payload, priority, status, created_at, updated_at)
    SELECT $1, $2::jsonb, $3, 'pending', NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM growth_jobs
      WHERE job_type = $1
        AND payload = $2::jsonb
        AND status IN ('pending','running')
    )
    `,
    [jobType, JSON.stringify(payload), priority]
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

async function planCityActions(limit = 10) {
  const lim = clampInt(limit, 5, 50);

  const top = await pool.query(
    `
    SELECT c.id, c.name, c.slug, cd.dominance_score, cd.leads, cd.avg_ctr, cd.total_ads
    FROM city_dominance cd
    JOIN cities c ON c.id = cd.city_id
    ORDER BY cd.dominance_score DESC
    LIMIT $1
    `,
    [lim]
  );

  for (const city of top.rows) {
    await enqueueJob(
      "SEO_LOCAL_CONTENT",
      { city_id: city.id, city_slug: city.slug, city_name: city.name },
      2
    );

    await enqueueJob("SEO_PRIORITIZE_CITY", { city_id: city.id, city_slug: city.slug }, 2);

    if (Number(city.leads) >= 10) {
      await enqueueJob("AUTO_CAMPAIGN", { city_id: city.id, city_name: city.name }, 1);
    }

    if (Number(city.avg_ctr) >= 0.02 && Number(city.total_ads) < 25) {
      await enqueueJob(
        "OPPORTUNITY_DETECTED",
        {
          city_id: city.id,
          city_slug: city.slug,
          signal: "high_ctr_low_supply",
        },
        1
      );
    }
  }
}

export async function runGrowthBrainEngine() {
  const instance = process.env.INSTANCE_ID || os.hostname();

  logger.info(
    {
      instance,
    },
    "[brain.growth] Iniciando growth brain"
  );

  await refreshAdMetrics();
  await upsertCityDominanceTop(80);
  await upsertLearningModelTop(800);
  await planCityActions(12);
  await enqueueUpgradeOffers();

  logger.info(
    {
      instance,
    },
    "[brain.growth] Growth brain finalizado"
  );
}
