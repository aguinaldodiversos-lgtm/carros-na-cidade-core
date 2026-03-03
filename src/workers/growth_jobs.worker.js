// src/workers/growth_jobs.worker.js
import os from "os";
import { pool } from "../infrastructure/database/db.js";
import { logger } from "../shared/logger.js";

const INSTANCE = process.env.INSTANCE_ID || os.hostname();
const BATCH = Number(process.env.GROWTH_JOBS_BATCH || 10);
const LOCK_MINUTES = Number(process.env.GROWTH_JOBS_LOCK_MINUTES || 10);

async function lockNextJobs(client) {
  const res = await client.query(
    `
    UPDATE growth_jobs
    SET status = 'running',
        locked_at = NOW(),
        locked_by = $1,
        updated_at = NOW()
    WHERE id IN (
      SELECT id
      FROM growth_jobs
      WHERE status = 'pending'
        AND (locked_at IS NULL OR locked_at < NOW() - ($2 || ' minutes')::interval)
      ORDER BY priority ASC, created_at ASC
      LIMIT $3
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
    `,
    [INSTANCE, String(LOCK_MINUTES), BATCH]
  );

  return res.rows;
}

async function completeJob(client, id) {
  await client.query(
    `
    UPDATE growth_jobs
    SET status='done', updated_at=NOW()
    WHERE id=$1
    `,
    [id]
  );
}

async function failJob(client, id, errMsg) {
  await client.query(
    `
    UPDATE growth_jobs
    SET status='failed',
        attempts = attempts + 1,
        last_error = $2,
        updated_at=NOW()
    WHERE id=$1
    `,
    [id, errMsg?.slice(0, 500) || "unknown"]
  );
}

/**
 * Aqui você liga nos seus serviços reais depois.
 * Por enquanto, executa ações “safe”: gerar páginas, priorizações, notificações.
 */
async function executeJob(client, job) {
  const { job_type, payload } = job;

  switch (job_type) {
    case "SEO_LOCAL_CONTENT": {
      // Aqui você liga no seu serviço real de SEO (garantirSEO / seoPages.service)
      // Por ora, apenas grava/atualiza seo_pages se existir
      // Se sua tabela seo_pages já existe (no seu DB aparece), mantenha:
      await client.query(
        `
        INSERT INTO seo_pages (city_id, type, created_at)
        VALUES ($1, 'city', NOW())
        ON CONFLICT DO NOTHING
        `,
        [payload.city_id]
      );
      return;
    }

    case "SEO_PRIORITIZE_CITY": {
      // Sinal interno: você pode escrever em system_settings ou city_status
      // Aqui: registra evento em city_status se existir
      await client.query(
        `
        INSERT INTO city_status (city_id, status, updated_at)
        VALUES ($1, 'priority', NOW())
        ON CONFLICT (city_id)
        DO UPDATE SET status='priority', updated_at=NOW()
        `,
        [payload.city_id]
      ).catch(() => {});
      return;
    }

    case "AUTO_CAMPAIGN": {
      // Apenas registra intenção: execução real depois via integrations
      await client.query(
        `
        INSERT INTO autopilot_actions (action_type, payload, status, created_at)
        VALUES ('AUTO_CAMPAIGN', $1::jsonb, 'pending', NOW())
        `,
        [JSON.stringify(payload)]
      ).catch(() => {});
      return;
    }

    case "OPPORTUNITY_DETECTED": {
      // Registra oportunidade para dashboard/monitoramento
      await client.query(
        `
        INSERT INTO city_opportunities (city_id, type, priority_level, created_at)
        VALUES ($1, $2, 'high', NOW())
        `,
        [payload.city_id, payload.signal || "generic"]
      ).catch(() => {});
      return;
    }

    default:
      // Tipo desconhecido: não quebra processamento
      return;
  }
}

async function runOnce() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const jobs = await lockNextJobs(client);

    if (!jobs.length) {
      await client.query("COMMIT");
      return;
    }

    for (const job of jobs) {
      try {
        await executeJob(client, job);
        await completeJob(client, job.id);
      } catch (err) {
        await failJob(client, job.id, err.message);
      }
    }

    await client.query("COMMIT");

    logger.info({
      message: "🧩 Growth Jobs processados",
      instance: INSTANCE,
      total: jobs.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({
      message: "❌ Erro Growth Jobs Worker",
      error: err.message,
      instance: INSTANCE,
    });
  } finally {
    client.release();
  }
}

export function startGrowthJobsWorker() {
  runOnce();
  setInterval(runOnce, 30 * 1000); // a cada 30s
}
