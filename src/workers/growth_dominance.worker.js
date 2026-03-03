import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

// ✅ plugue nos seus serviços reais
// Se já existir, use:
// import { garantirSEO } from "../modules/seo/seoPages.service.js";
// import { generateSeoArticle } from "../modules/seo/seoAI.service.js";

async function refreshMetrics() {
  // Atualiza CTR/leads
  await pool.query(`REFRESH MATERIALIZED VIEW ad_metrics`);
}

async function computeCityDominance() {
  // Sem depender de tabela extra: calcula “hot cities” por demanda + leads
  const result = await pool.query(`
    SELECT
      c.id as city_id,
      c.name,
      c.slug,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COUNT(a.id) AS total_ads,
      COUNT(e.id) FILTER (WHERE e.event_type='lead') AS total_leads,
      AVG(m.ctr) AS avg_ctr
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN ads a ON a.city_id = c.id AND a.status='active'
    LEFT JOIN ad_events e ON e.ad_id = a.id
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    GROUP BY c.id, c.name, c.slug, cm.demand_score
    ORDER BY
      (COUNT(e.id) FILTER (WHERE e.event_type='lead')) DESC,
      COALESCE(cm.demand_score,0) DESC
    LIMIT 10
  `);

  return result.rows;
}

async function enqueue(job_type, payload, priority = 3) {
  await pool.query(
    `
    INSERT INTO growth_jobs (job_type, payload, priority)
    VALUES ($1, $2::jsonb, $3)
    `,
    [job_type, JSON.stringify(payload), priority]
  );
}

async function planActions() {
  const topCities = await computeCityDominance();

  for (const city of topCities) {
    // 1) Gerar conteúdo SEO local
    await enqueue(
      "SEO_LOCAL_CONTENT",
      { city_id: city.city_id, city_name: city.name, city_slug: city.slug },
      2
    );

    // 2) Priorizar anúncios da cidade no SEO (sinal pro seu cérebro)
    await enqueue(
      "SEO_PRIORITIZE_CITY",
      { city_id: city.city_id, city_slug: city.slug },
      2
    );

    // 3) Campanha automática (Google/Meta) quando leads subirem
    if (Number(city.total_leads) >= 10) {
      await enqueue(
        "AUTO_CAMPAIGN",
        { city_id: city.city_id, city_name: city.name },
        1
      );
    }

    // 4) Oferta upgrade para lojistas em cidades quentes
    if (Number(city.total_ads) >= 30 && Number(city.avg_ctr || 0) > 0.02) {
      await enqueue(
        "OFFER_UPGRADE",
        { city_id: city.city_id, city_name: city.name },
        1
      );
    }
  }
}

async function runOnce() {
  try {
    logger.info("🧠 Growth Dominance Worker iniciando...");
    await refreshMetrics();
    await planActions();
    logger.info("✅ Growth Dominance Worker finalizado");
  } catch (err) {
    logger.error({ message: "❌ Erro Growth Dominance Worker", err });
  }
}

export function startGrowthDominanceWorker() {
  runOnce();
  setInterval(runOnce, 6 * 60 * 60 * 1000); // a cada 6h
}
