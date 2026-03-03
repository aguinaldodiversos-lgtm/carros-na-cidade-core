import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

// Plugue aqui seus serviços reais:
// import { garantirSEO } from "../modules/seo/seoPages.service.js";
// import { generateSeoArticle } from "../modules/seo/seoAI.service.js";
// import { whatsappQueue } from "../queues/whatsapp.queue.js";

async function pickJob() {
  const r = await pool.query(
    `
    UPDATE growth_jobs
    SET status='running', updated_at=NOW()
    WHERE id = (
      SELECT id FROM growth_jobs
      WHERE status='pending' AND run_after <= NOW()
      ORDER BY priority ASC, created_at ASC
      LIMIT 1
    )
    RETURNING *
    `
  );
  return r.rows[0] || null;
}

async function completeJob(id) {
  await pool.query(`UPDATE growth_jobs SET status='done', updated_at=NOW() WHERE id=$1`, [id]);
}

async function failJob(id, reason) {
  await pool.query(
    `UPDATE growth_jobs SET status='failed', payload = payload || jsonb_build_object('error',$2), updated_at=NOW() WHERE id=$1`,
    [id, String(reason || "unknown")]
  );
}

async function processJob(job) {
  const { job_type, payload } = job;

  switch (job_type) {
    case "SEO_LOCAL_CONTENT": {
      // ✅ aqui você chama garantirSEO(city,...)
      logger.info({ message: "📄 SEO_LOCAL_CONTENT", payload });
      return;
    }

    case "SEO_PRIORITIZE_CITY": {
      // ✅ aqui você pode setar um "target" interno pra cidade (ou tabela city_targets se você já usa)
      logger.info({ message: "⭐ SEO_PRIORITIZE_CITY", payload });
      return;
    }

    case "AUTO_CAMPAIGN": {
      // ✅ aqui você cria campanha/brief no seu autopilot (googleAds/metaAds) ou gera uma task para operador
      logger.info({ message: "📣 AUTO_CAMPAIGN", payload });
      return;
    }

    case "OFFER_UPGRADE": {
      // ✅ aqui você identifica advertisers da cidade e enfileira WhatsApp/email
      logger.info({ message: "💳 OFFER_UPGRADE", payload });
      return;
    }

    default:
      logger.warn({ message: "⚠️ Job type desconhecido", job_type });
  }
}

async function runLoop() {
  try {
    const job = await pickJob();
    if (!job) return;

    await processJob(job);
    await completeJob(job.id);
  } catch (err) {
    logger.error({ message: "❌ Erro Growth Jobs Worker", err });
    // Se não conseguimos pegar job id, não dá pra marcar failed com segurança
  }
}

export function startGrowthJobsWorker() {
  setInterval(runLoop, 2_000); // processa continuamente
}
