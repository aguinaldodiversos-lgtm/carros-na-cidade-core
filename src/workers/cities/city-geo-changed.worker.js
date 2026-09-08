// src/workers/cities/city-geo-changed.worker.js
//
// Worker BullMQ da fila `cities.geo-changed` (F1 §3.1): recomputa as linhas de
// `region_memberships` de uma cidade cujas coordenadas foram preenchidas.
// Registrado em bootstrap.registry.js (RUN_WORKER_CITY_GEO_CHANGED).
import { Worker } from "bullmq";
import { logger } from "../../shared/logger.js";
import { getQueueRedisConnection } from "../../infrastructure/queue/redis.connection.js";
import { pool } from "../../infrastructure/database/db.js";
import { CITY_GEO_CHANGED_QUEUE_NAME } from "../../queues/city-geo-changed.queue.js";
import { recomputeCityMemberships } from "../../modules/regions/region-memberships.builder.js";

let workerInstance = null;

export async function processCityGeoChangedJob(job) {
  const cityId = Number(job?.data?.cityId);
  return recomputeCityMemberships(pool, cityId);
}

export async function startCityGeoChangedWorker() {
  if (workerInstance) {
    logger.warn("[city-geo-changed.worker] Worker já inicializado");
    return workerInstance;
  }
  const connection = getQueueRedisConnection();
  if (!connection) {
    logger.warn(
      "[city-geo-changed.worker] Redis indisponível (DISABLE_REDIS ou REDIS_URL). Worker não iniciado; o producer executa inline."
    );
    return null;
  }

  workerInstance = new Worker(CITY_GEO_CHANGED_QUEUE_NAME, processCityGeoChangedJob, {
    connection,
    concurrency: 1, // recomputes tocam a mesma tabela; serializar evita deadlock entre vizinhas
    autorun: true,
  });
  workerInstance.on("ready", () =>
    logger.info({ queue: CITY_GEO_CHANGED_QUEUE_NAME }, "[city-geo-changed.worker] Worker pronto")
  );
  workerInstance.on("completed", (job, result) =>
    logger.info({ jobId: job.id, ...result }, "[city-geo-changed.worker] Job concluído")
  );
  workerInstance.on("failed", (job, error) =>
    logger.error(
      { jobId: job?.id, cityId: job?.data?.cityId, error: error?.message || String(error) },
      "[city-geo-changed.worker] Job falhou"
    )
  );
  return workerInstance;
}

export async function stopCityGeoChangedWorker() {
  if (!workerInstance) return;
  await workerInstance.close();
  workerInstance = null;
  logger.info("[city-geo-changed.worker] Worker encerrado");
}
