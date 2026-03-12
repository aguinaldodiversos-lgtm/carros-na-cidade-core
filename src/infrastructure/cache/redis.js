import Redis from "ioredis";
import { logger } from "../../shared/logger.js";

let redis = null;

function isRedisDisabled() {
  return String(process.env.DISABLE_REDIS || "").toLowerCase() === "true";
}

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

const url = String(process.env.REDIS_URL || "").trim();
const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const skipLocalhostInProd = isProd && isLocalhostUrl(url);

if (!url || isRedisDisabled() || skipLocalhostInProd) {
  if (!url) logger.warn("⚠️ REDIS_URL não configurado. Cache desativado.");
  else if (isRedisDisabled()) logger.warn("⚠️ DISABLE_REDIS=true. Cache desativado.");
  else if (skipLocalhostInProd) logger.warn("⚠️ REDIS_URL localhost em produção. Cache desativado.");
} else {
  redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 5_000,
    retryStrategy: (times) => Math.min(times * 200, 2_000),
  });

  redis.on("connect", () => logger.info("✅ Redis conectado"));
  redis.on("error", (err) =>
    logger.error({ message: "❌ Erro Redis", err: err?.message || err })
  );
}

export { redis };
