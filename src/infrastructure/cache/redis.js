// src/infrastructure/cache/redis.js

import Redis from "ioredis";
import { logger } from "../../shared/logger.js";

let redis;

if (!process.env.REDIS_URL) {
  logger.warn("⚠ REDIS_URL não configurado. Cache desativado.");
} else {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on("connect", () => {
    logger.info("✅ Redis conectado");
  });

  redis.on("error", (err) => {
    logger.error("❌ Erro Redis:", err.message);
  });
}

export { redis };
