// src/infrastructure/queue/redis.connection.js
import Redis from "ioredis";
import { logger } from "../../shared/logger.js";

/**
 * Conexão Redis única para filas (BullMQ etc).
 * - Só inicializa se DISABLE_REDIS !== true e REDIS_URL estiver definido.
 * - Suporta compatibilidade com imports antigos (getQueueRedisConnection).
 * - Não derruba a aplicação quando Redis estiver desabilitado; retorna null no init.
 */

let redis = null;
let initPromise = null;

function isTrue(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function getRedisUrl() {
  return String(process.env.REDIS_URL || "").trim();
}

function shouldEnableRedis() {
  if (isTrue(process.env.DISABLE_REDIS)) return false;
  return Boolean(getRedisUrl());
}

/**
 * Retorna a instância Redis já inicializada.
 * Use após initQueueRedisConnection().
 */
export function getRedis() {
  if (!redis) throw new Error("Redis not initialized");
  return redis;
}

/**
 * COMPAT: alguns módulos antigos esperam este nome.
 * Mantém o comportamento estrito (se não inicializado, lança).
 */
export function getQueueRedisConnection() {
  return getRedis();
}

/**
 * Inicializa (se aplicável) e retorna a conexão Redis.
 * Se Redis estiver desabilitado por env, retorna null.
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

  const url = getRedisUrl();

  initPromise = (async () => {
    const client = new Redis(url, {
      // BullMQ recomenda: maxRetriesPerRequest = null para evitar falhas em jobs longos
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      // Evita flood de logs / reconexões agressivas (ajusta conforme necessidade)
      retryStrategy(times) {
        // backoff simples até ~5s
        return Math.min(50 * Math.max(1, times), 5000);
      },
    });

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

    try {
      await client.connect();
      redis = client;
      logger.info("[queue.redis] Redis conectado");
      return redis;
    } catch (err) {
      // Importante: não deixar initPromise pendurado para sempre
      try {
        client.disconnect();
      } catch {}
      redis = null;

      logger.error(
        { error: { code: err?.code, message: err?.message } },
        "[queue.redis] Falha ao conectar no Redis"
      );

      // Mantém comportamento seguro: derruba apenas se Redis era obrigatório
      // (aqui, só tentamos conectar se estava habilitado)
      throw err;
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
    // quit = encerra de forma limpa
    await client.quit();
  } catch {
    // fallback: encerra imediatamente
    try {
      client.disconnect();
    } catch {}
  } finally {
    logger.info("[queue.redis] Conexão Redis encerrada");
  }
}
