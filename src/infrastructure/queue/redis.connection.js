// src/infrastructure/queue/redis.connection.js
import Redis from "ioredis";
import { logger } from "../../shared/logger.js";

let redis = null;

function shouldEnableRedis() {
  const disabled = String(process.env.DISABLE_REDIS || "false").toLowerCase() === "true";
  if (disabled) return false;

  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) return false;

  return true;
}

export function getRedis() {
  if (!redis) throw new Error("Redis not initialized");
  return redis;
}

export async function initQueueRedisConnection() {
  if (redis) return redis;

  if (!shouldEnableRedis()) {
    logger.warn("[queue.redis] Redis desativado (DISABLE_REDIS=true ou REDIS_URL vazio)");
    return null;
  }

  const url = String(process.env.REDIS_URL).trim();

  redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.error({ error: { code: err?.code, message: err?.message } }, "[queue.redis] Erro na conexão Redis");
  });

  await redis.connect();
  logger.info("[queue.redis] Redis conectado");
  return redis;
}

export async function closeQueueRedisConnection() {
  if (!redis) return;
  try {
    await redis.quit();
  } catch {
    try { redis.disconnect(); } catch {}
  } finally {
    redis = null;
    logger.info("[queue.redis] Conexão Redis encerrada");
  }
}
