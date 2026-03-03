import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

/* =====================================================
   REFRESH MÉTRICAS (CTR / LEADS)
===================================================== */

async function refreshMetrics() {
  try {
    await pool.query(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY ad_metrics
    `);
  } catch {
    // fallback caso não tenha índice unique
    await pool.query(`
      REFRESH MATERIALIZED VIEW ad_metrics
    `);
  }
}
// ✅ UPGRADE (NUNCA AUTOMÁTICO) — apenas oferta/notificação com consentimento
// Objetivo: inserir notificações para o lojista decidir e dar OK.
// Requer: tabela notification_queue com colunas mínimas:
// (id, user_id, type, payload jsonb, status, created_at)
//
// - Idempotente: não cria spam (evita duplicar a mesma oferta em janela de 7 dias)
// - Seguro: só notifica lojistas (advertisers com user_id válido)

import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

/**
 * Enfileira notificações de oferta de upgrade para lojistas
 * SEMPRE com consentimento explícito do lojista.
 */
export async function enqueueUpgradeOffers() {
  try {
    const result = await pool.query(`
      INSERT INTO notification_queue (user_id, type, payload, status, created_at)
      SELECT
        a.user_id,
        'upgrade_offer',
        jsonb_build_object(
          'city_id', a.city_id,
          'reason', 'Cidade com alta dominância/alta demanda',
          'dominance_score', cd.dominance_score,
          'message',
            'Sua cidade está aquecida. Quer impulsionar seus anúncios e aparecer em destaque? Toque para ver os planos.'
        ),
        'pending',
        NOW()
      FROM advertisers a
      JOIN city_dominance cd ON cd.city_id = a.city_id
      WHERE
        a.user_id IS NOT NULL
        AND cd.dominance_score >= 80
        AND NOT EXISTS (
          SELECT 1
          FROM notification_queue n
          WHERE n.user_id = a.user_id
            AND n.type = 'upgrade_offer'
            AND n.created_at > NOW() - INTERVAL '7 days'
            AND n.status IN ('pending','sent','opened')
        )
      RETURNING id, user_id
    `);

    logger.info({
      message: "📩 Notificações de oferta de upgrade enfileiradas (consentimento obrigatório)",
      total: result.rowCount,
    });

    return { inserted: result.rowCount };
  } catch (err) {
    logger.error({
      message: "❌ Falha ao enfileirar ofertas de upgrade",
      error: err.message,
    });
    throw err;
  }
}

/**
 * Exemplo de uso em worker:
 *
 * import { enqueueUpgradeOffers } from "../workers/upgrade_offer.worker.js";
 * await enqueueUpgradeOffers();
 */
/* =====================================================
   COMPUTAR DOMINÂNCIA POR CIDADE
===================================================== */

async function computeCityDominance() {
  const result = await pool.query(`
    SELECT
      c.id as city_id,
      c.name,
      c.slug,
      COALESCE(cm.demand_score, 0) AS demand_score,
      COUNT(a.id) AS total_ads,
      COUNT(e.id) FILTER (WHERE e.event_type='lead') AS total_leads,
      COALESCE(AVG(m.ctr),0) AS avg_ctr,
      (
        (COUNT(e.id) FILTER (WHERE e.event_type='lead') * 5)
        + (COALESCE(AVG(m.ctr),0) * 100)
        + COUNT(a.id)
        + COALESCE(cm.demand_score,0)
      ) AS dominance_score
    FROM cities c
    LEFT JOIN city_metrics cm ON cm.city_id = c.id
    LEFT JOIN ads a ON a.city_id = c.id AND a.status='active'
    LEFT JOIN ad_events e ON e.ad_id = a.id
    LEFT JOIN ad_metrics m ON m.ad_id = a.id
    GROUP BY c.id, c.name, c.slug, cm.demand_score
    ORDER BY dominance_score DESC
    LIMIT 10
  `);

  return result.rows;
}

/* =====================================================
   UPSERT CITY_DOMINANCE
===================================================== */

async function updateCityDominance(cities) {
  for (const city of cities) {
    await pool.query(
      `
      INSERT INTO city_dominance
      (city_id, dominance_score, leads, avg_ctr, total_ads, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (city_id)
      DO UPDATE SET
        dominance_score = EXCLUDED.dominance_score,
        leads = EXCLUDED.leads,
        avg_ctr = EXCLUDED.avg_ctr,
        total_ads = EXCLUDED.total_ads,
        updated_at = NOW()
      `,
      [
        city.city_id,
        city.dominance_score,
        city.total_leads,
        city.avg_ctr,
        city.total_ads,
      ]
    );
  }
}

/* =====================================================
   ENQUEUE JOB (ANTI-DUPLICAÇÃO)
===================================================== */

async function enqueue(job_type, payload, priority = 3) {
  await pool.query(
    `
    INSERT INTO growth_jobs (job_type, payload, priority)
    SELECT $1, $2::jsonb, $3
    WHERE NOT EXISTS (
      SELECT 1 FROM growth_jobs
      WHERE job_type = $1
      AND payload = $2::jsonb
      AND status IN ('pending','running')
    )
    `,
    [job_type, JSON.stringify(payload), priority]
  );
}

/* =====================================================
   PLANEJAR AÇÕES ESTRATÉGICAS
===================================================== */

async function planActions(cities) {
  for (const city of cities) {
    const {
      city_id,
      name,
      slug,
      total_leads,
      total_ads,
      avg_ctr,
      dominance_score,
    } = city;

    // SEO Local automático
    if (dominance_score > 30) {
      await enqueue(
        "SEO_LOCAL_CONTENT",
        { city_id, city_name: name, city_slug: slug },
        2
      );
    }

    // Priorizar cidade no SEO
    if (dominance_score > 50) {
      await enqueue(
        "SEO_PRIORITIZE_CITY",
        { city_id, city_slug: slug },
        2
      );
    }

    // Campanha automática
    if (Number(total_leads) >= 10) {
      await enqueue(
        "AUTO_CAMPAIGN",
        { city_id, city_name: name },
        1
      );
    }

    // Upgrade lojistas
    if (Number(total_ads) >= 30 && Number(avg_ctr) > 0.02) {
      await enqueue(
        "OFFER_UPGRADE",
        { city_id, city_name: name },
        1
      );
    }
  }
}

/* =====================================================
   EXECUÇÃO PRINCIPAL
===================================================== */

async function runOnce() {
  const client = await pool.connect();

  try {
    logger.info("🧠 Growth Dominance Worker iniciando...");

    await client.query("BEGIN");

    await refreshMetrics();

    const topCities = await computeCityDominance();

    await updateCityDominance(topCities);

    await planActions(topCities);

    await client.query("COMMIT");

    logger.info("🔥 Growth Dominance Worker finalizado com sucesso");
  } catch (err) {
    await client.query("ROLLBACK");

    logger.error({
      message: "❌ Erro Growth Dominance Worker",
      error: err.message,
    });
  } finally {
    client.release();
  }
}

/* =====================================================
   START
===================================================== */

export function startGrowthDominanceWorker() {
  runOnce();
  setInterval(runOnce, 6 * 60 * 60 * 1000); // a cada 6h
}
