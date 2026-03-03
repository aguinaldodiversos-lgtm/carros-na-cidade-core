import Redis from "ioredis";
import { logger } from "../../shared/logger.js";

let redis = null;

if (!process.env.REDIS_URL) {
  logger.warn("⚠️ REDIS_URL não configurado. Cache desativado.");
} else {
  redis = new Redis(process.env.REDIS_URL, {
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
