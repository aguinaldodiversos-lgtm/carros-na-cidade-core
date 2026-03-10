// src/infrastructure/queue/redis.connection.js
import Redis from "ioredis";
import { logger } from "../../shared/logger.js";

/**
 * Redis connection (queues).
 * - Compatível com módulos que chamam getQueueRedisConnection() no import-time.
 * - Evita crash: getQueueRedisConnection() nunca dá "Redis not initialized".
 * - initQueueRedisConnection() pode ser usado no bootstrap para conectar de forma explícita.
 */

let redis = null;
let initPromise = null;

function isTrue(v) {
  return String(v || "").trim().toLowerCase() === "true";
}

function getRedisUrl() {
  return String(process.env.REDIS_URL || "").trim();
}

function shouldEnableRedis() {
  if (isTrue(process.env.DISABLE_REDIS)) return false;
  return Boolean(getRedisUrl());
}

function buildRedisOptions() {
  return {
    // recomendado para BullMQ
    maxRetriesPerRequest: null,
    enableReadyCheck: true,

    // evita travar o processo ao criar a instância
    lazyConnect: true,

    // em ambientes sem redis, evita fila offline acumulando memória
    enableOfflineQueue: false,

    retryStrategy(times) {
      // backoff simples até 5s
      return Math.min(50 * Math.max(1, times), 5000);
    },
  };
}

function attachRedisListeners(client) {
  client.on("error", (err) => {
    logger.error(
      { error: { code: err?.code, message: err?.message } },
      "[queue.redis] Erro na conexão Redis"
    );
  });

  client.on("ready", () => {
    logger.info("[queue.redis] Redis pronto");
  });

  client.on("end", () => {
    logger.info("[queue.redis] Redis desconectado");
  });
}

function ensureRedisInstanceForQueues() {
  if (redis) return redis;

  const url = getRedisUrl();

  // Se estiver desabilitado ou sem URL, NÃO vamos crashar o app.
  // Mas alguns módulos (ex: whatsapp.queue.js) precisam de um objeto "connection" no import-time.
  // Então devolvemos um client lazy apontando para localhost apenas para manter compatibilidade.
  if (!url || !shouldEnableRedis()) {
    logger.warn(
      "[queue.redis] Redis não configurado/disabled. Mantendo client lazy (compat) — filas podem não funcionar até configurar REDIS_URL."
    );

    const fallbackUrl = "redis://127.0.0.1:6379";
    const client = new Redis(fallbackUrl, buildRedisOptions());
    attachRedisListeners(client);
    redis = client;
    return redis;
  }

  const client = new Redis(url, buildRedisOptions());
  attachRedisListeners(client);
  redis = client;
  return redis;
}

/**
 * Uso estrito (se não tiver instância, lança).
 * Use quando você TEM certeza que initQueueRedisConnection já rodou.
 */
export function getRedis() {
  if (!redis) throw new Error("Redis not initialized");
  return redis;
}

/**
 * COMPAT: usado por módulos que esperam esse export.
 * Importante: NÃO pode lançar no import-time.
 */
export function getQueueRedisConnection() {
  return ensureRedisInstanceForQueues();
}

/**
 * Inicializa e tenta conectar (quando habilitado).
 * Se DISABLE_REDIS=true ou REDIS_URL vazio, retorna null (sem tentar conectar).
 */
export async function initQueueRedisConnection() {
  if (redis) return redis;
  if (initPromise) return initPromise;

  if (!shouldEnableRedis()) {
    logger.warn(
      "[queue.redis] Redis desativado (DISABLE_REDIS=true ou REDIS_URL vazio)"
    );
    return null;
  }

  initPromise = (async () => {
    const client = ensureRedisInstanceForQueues();

    try {
      // conecta explicitamente
      await client.connect();
      logger.info("[queue.redis] Redis conectado");
      return client;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export async function closeQueueRedisConnection() {
  if (!redis) return;

  const client = redis;
  redis = null;
  initPromise = null;

  try {
    await client.quit();
  } catch {
    try {
      client.disconnect();
    } catch {}
  } finally {
    logger.info("[queue.redis] Conexão Redis encerrada");
  }
}
