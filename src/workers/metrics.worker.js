import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

async function runMetricsWorker() {
  logger.info("📊 Metrics Worker iniciado...");

  try {
    /* =====================================================
       1️⃣ REFRESH MATERIALIZED VIEW (CTR / LEADS)
    ===================================================== */
    await pool.query(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY ad_metrics
    `);

    logger.info("✅ ad_metrics atualizado");

    /* =====================================================
       2️⃣ LIMPEZA DE EVENTOS ANTIGOS (90 dias)
    ===================================================== */
    await pool.query(`
      DELETE FROM ad_events
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);

    logger.info("🧹 Eventos antigos removidos");

    /* =====================================================
       3️⃣ LIMPEZA MÉTRICAS ANTIGAS (caso exista)
    ===================================================== */
    await pool.query(`
      DELETE FROM advertiser_metrics
      WHERE created_at < NOW() - INTERVAL '90 days'
    `);

    logger.info("🧹 advertiser_metrics limpo");

    /* =====================================================
       4️⃣ ATUALIZAR CITY DOMINANCE
    ===================================================== */
    await pool.query(`
      INSERT INTO city_dominance (city_id, dominance_score, leads, avg_ctr, total_ads)
      SELECT
        c.id,
        (COUNT(e.id) FILTER (WHERE e.event_type='lead') * 5)
        + (COALESCE(AVG(m.ctr),0) * 100)
        + COUNT(a.id) AS score,
        COUNT(e.id) FILTER (WHERE e.event_type='lead'),
        COALESCE(AVG(m.ctr),0),
        COUNT(a.id)
      FROM cities c
      LEFT JOIN ads a ON a.city_id = c.id AND a.status='active'
      LEFT JOIN ad_events e ON e.ad_id = a.id
      LEFT JOIN ad_metrics m ON m.ad_id = a.id
      GROUP BY c.id
      ON CONFLICT (city_id)
      DO UPDATE SET
        dominance_score = EXCLUDED.dominance_score,
        leads = EXCLUDED.leads,
        avg_ctr = EXCLUDED.avg_ctr,
        total_ads = EXCLUDED.total_ads,
        updated_at = NOW()
    `);

    logger.info("🔥 city_dominance atualizado");

    /* =====================================================
       5️⃣ ATUALIZAR LEARNING MODEL
    ===================================================== */
    await pool.query(`
      INSERT INTO learning_model (city_id, model, avg_ctr, leads)
      SELECT
        a.city_id,
        a.model,
        COALESCE(AVG(m.ctr),0),
        COUNT(e.id) FILTER (WHERE e.event_type='lead')
      FROM ads a
      LEFT JOIN ad_metrics m ON m.ad_id=a.id
      LEFT JOIN ad_events e ON e.ad_id=a.id
      GROUP BY a.city_id,a.model
      ON CONFLICT (city_id,model)
      DO UPDATE SET
        avg_ctr=EXCLUDED.avg_ctr,
        leads=EXCLUDED.leads
    `);

    logger.info("🧠 learning_model atualizado");

    logger.info("🏁 Metrics Worker finalizado com sucesso");

  } catch (err) {
    logger.error({
      message: "❌ Erro no Metrics Worker",
      error: err.message,
    });
  }
}

/* =====================================================
   START
===================================================== */

export function startMetricsWorker() {
  runMetricsWorker(); // roda imediatamente
  setInterval(runMetricsWorker, 1000 * 60 * 10); // a cada 10 minutos
}
