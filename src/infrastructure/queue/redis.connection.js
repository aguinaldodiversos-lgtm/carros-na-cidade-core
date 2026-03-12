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

/** Em produção/cloud, localhost/127.0.0.1 nunca funciona (ex: Render). Evita ECONNREFUSED. */
function isLocalhostUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = (u.hostname || "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

/** Só permite localhost em desenvolvimento local explícito. */
function isLocalDevelopment() {
  const env = String(process.env.NODE_ENV || "").toLowerCase();
  return env === "development" || env === "dev" || env === "local";
}

function shouldEnableRedis() {
  if (isTrue(process.env.DISABLE_REDIS)) return false;
  const url = getRedisUrl();
  if (!url) return false;
  // Bloqueia localhost em qualquer ambiente que não seja development (inclui "produção", "production", etc.)
  if (!isLocalDevelopment() && isLocalhostUrl(url)) {
    logger.warn(
      "[queue.redis] REDIS_URL aponta para localhost. Em cloud (Render etc.) use Redis externo. Redis desativado."
    );
    return false;
  }
  return true;
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

  // CRÍTICO: Sem REDIS_URL, nunca criar cliente (evita BullMQ/ioredis usar default 127.0.0.1:6379)
  if (!url) {
    logger.warn(
      "[queue.redis] REDIS_URL ausente. Redis desativado. Configure REDIS_URL ou DISABLE_REDIS=true."
    );
    return null;
  }

  // Se estiver desabilitado ou URL inválida para produção, NÃO criar.
  if (!shouldEnableRedis()) {
    logger.warn(
      "[queue.redis] Redis desativado ou REDIS_URL ausente. Filas não disponíveis. Configure REDIS_URL no Render para habilitar."
    );
    return null;
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
  const instance = ensureRedisInstanceForQueues();
  if (!instance) return null;
  return instance;
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
    if (!client) return null;
    try {
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
