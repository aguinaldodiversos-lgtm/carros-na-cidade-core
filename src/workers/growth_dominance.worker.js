import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";
import { enqueueUpgradeOffers } from "./upgrade_offer.worker.js";
import { refreshAdMetricsTable } from "./ad-metrics.refresh.js";

async function refreshMetrics() {
  try {
    await refreshAdMetricsTable(pool);
    logger.info("📊 ad_metrics atualizada");
  } catch (err) {
    logger.warn("⚠️ Não foi possível atualizar ad_metrics (verifique se existe)");
  }
}

/* =====================================================
   CALCULAR DOMINÂNCIA POR CIDADE
===================================================== */

async function computeCityDominance() {
  const result = await pool.query(`
    SELECT
      c.id as city_id,
      c.name,
      c.slug,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COUNT(DISTINCT a.id) AS total_ads,
      COUNT(DISTINCT e.id) FILTER (WHERE e.event_type='lead') AS total_leads,
      COALESCE(AVG(m.ctr),0) AS avg_ctr
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN ads a ON a.city_id = c.id AND a.status='active'
    LEFT JOIN ad_events e ON e.ad_id = a.id
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    GROUP BY c.id, c.name, c.slug, cm.demand_score
  `);

  return result.rows.map((row) => {
    const dominance_score =
      Number(row.total_leads) * 4 +
      Number(row.demand_score) * 2 +
      Number(row.avg_ctr) * 100 +
      Number(row.total_ads) * 0.5;

    return {
      ...row,
      dominance_score: Math.round(dominance_score),
    };
  });
}

/* =====================================================
   ATUALIZAR TABELA city_dominance
===================================================== */

async function updateCityDominance(cities) {
  for (const city of cities) {
    await pool.query(
      `
      INSERT INTO city_dominance (city_id, dominance_score, updated_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        dominance_score = EXCLUDED.dominance_score,
        updated_at = NOW()
      `,
      [city.city_id, city.dominance_score]
    );
  }

  logger.info("🏙️ city_dominance atualizada");
}

/* =====================================================
   ENFILEIRAR AÇÕES ESTRATÉGICAS
===================================================== */

async function enqueue(job_type, payload, priority = 3) {
  await pool.query(
    `
    INSERT INTO growth_jobs (job_type, payload, priority, created_at)
    VALUES ($1,$2::jsonb,$3,NOW())
    `,
    [job_type, JSON.stringify(payload), priority]
  );
}

async function planActions(cities) {
  for (const city of cities) {
    if (city.dominance_score < 40) continue;

    // 1️⃣ SEO LOCAL
    await enqueue("SEO_LOCAL_CONTENT", { city_id: city.city_id, city_slug: city.slug }, 2);

    // 2️⃣ PRIORIZAR SEO DA CIDADE
    await enqueue("SEO_PRIORITIZE_CITY", { city_id: city.city_id }, 2);

    // 3️⃣ AUTO CAMPAIGN (somente cidades quentes)
    if (city.total_leads >= 10) {
      await enqueue("AUTO_CAMPAIGN", { city_id: city.city_id }, 1);
    }
  }

  logger.info("🧠 Ações estratégicas enfileiradas");
}

/* =====================================================
   EXECUÇÃO PRINCIPAL
===================================================== */

async function runOnce() {
  try {
    logger.info("🧠 Growth Dominance Worker iniciando...");

    await refreshMetrics();

    const cities = await computeCityDominance();

    await updateCityDominance(cities);

    await planActions(cities);

    // ✅ OFERTA DE UPGRADE (COM CONSENTIMENTO)
    await enqueueUpgradeOffers();

    logger.info("✅ Growth Dominance Worker finalizado");
  } catch (err) {
    logger.error({
      message: "❌ Erro no Growth Dominance Worker",
      error: err.message,
    });
  }
}

/* =====================================================
   START
===================================================== */

export function startGrowthDominanceWorker() {
  runOnce();
  setInterval(runOnce, 6 * 60 * 60 * 1000); // a cada 6h
}
