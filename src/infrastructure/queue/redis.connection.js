import IORedis from "ioredis";
import { logger } from "../../shared/logger.js";

let queueRedisConnectionInstance = null;

export function getQueueRedisConnection() {
  if (queueRedisConnectionInstance) {
    return queueRedisConnectionInstance;
  }

  queueRedisConnectionInstance = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  queueRedisConnectionInstance.on("connect", () => {
    logger.info("[queue.redis] Redis conectado");
  });

  queueRedisConnectionInstance.on("error", (error) => {
    logger.error({ error }, "[queue.redis] Erro na conexão Redis");
  });

  return queueRedisConnectionInstance;
}

export async function closeQueueRedisConnection() {
  if (!queueRedisConnectionInstance) return;

  await queueRedisConnectionInstance.quit();
  queueRedisConnectionInstance = null;

  logger.info("[queue.redis] Conexão Redis encerrada");
}
