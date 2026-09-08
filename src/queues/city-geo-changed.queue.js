// src/queues/city-geo-changed.queue.js
//
// Fila `cities.geo-changed` — Search Policy Engine v2.1, Fase F1 (§3.1).
//
// Quando latitude/longitude de UMA cidade são preenchidas, só as linhas dessa
// cidade em `region_memberships` (como base e como membro) precisam ser
// recomputadas — não a tabela inteira. O job carrega `{ cityId }`.
//
// Sem Redis (produção hoje roda com `redis: disabled`), a fila não existe.
// Nesse caso `enqueueCityGeoChanged` executa o recompute INLINE, para que a
// vizinhança de uma cidade nova nunca fique pendente num job que ninguém
// consumiria (foi assim que a self-row de cidade nova ficou faltando — BUG-REG-01).
import { Queue } from "bullmq";
import { logger } from "../shared/logger.js";
import { getQueueRedisConnection } from "../infrastructure/queue/redis.connection.js";
import { QUEUE_NAMES, QUEUE_DEFAULT_JOB_OPTIONS } from "../infrastructure/queue/queue.constants.js";
import { pool } from "../infrastructure/database/db.js";
import { recomputeCityMemberships } from "../modules/regions/region-memberships.builder.js";

export const CITY_GEO_CHANGED_QUEUE_NAME = QUEUE_NAMES.CITY_GEO_CHANGED;

let queueInstance = null;

export function getCityGeoChangedQueue() {
  if (queueInstance) return queueInstance;
  const connection = getQueueRedisConnection();
  if (!connection) return null;
  queueInstance = new Queue(CITY_GEO_CHANGED_QUEUE_NAME, {
    connection,
    defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS,
  });
  return queueInstance;
}

/**
 * Enfileira (ou executa inline, sem Redis) o recompute de uma cidade.
 * `jobId` determinístico por cidade: dois seeds seguidos não duplicam trabalho.
 *
 * @returns {{ mode: "queued"|"inline", jobId?: string, result?: object }}
 */
export async function enqueueCityGeoChanged(cityId, { inlineFallback = true } = {}) {
  const id = Number(cityId);
  if (!Number.isFinite(id) || id <= 0) throw new Error(`cityId inválido: ${cityId}`);

  const queue = getCityGeoChangedQueue();
  if (queue) {
    const job = await queue.add("recompute", { cityId: id }, { jobId: `city-${id}` });
    logger.info({ cityId: id, jobId: job.id }, "[cities.geo-changed] job enfileirado");
    return { mode: "queued", jobId: job.id };
  }

  if (!inlineFallback) {
    logger.warn({ cityId: id }, "[cities.geo-changed] sem Redis e sem fallback inline — ignorado");
    return { mode: "skipped" };
  }

  const result = await recomputeCityMemberships(pool, id);
  logger.info({ cityId: id, ...result }, "[cities.geo-changed] recompute inline (sem Redis)");
  return { mode: "inline", result };
}

export async function closeCityGeoChangedQueue() {
  if (!queueInstance) return;
  await queueInstance.close();
  queueInstance = null;
}
