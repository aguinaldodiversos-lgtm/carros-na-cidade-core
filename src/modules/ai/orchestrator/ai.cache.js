import Redis from "ioredis";

export function createRedisClient({ logger }) {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("REDIS_URL ausente. Cache/Queue podem falhar em produção.");
  }

  const redis = new Redis(url || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.error({ message: "Redis error", error: err?.message || String(err) });
  });

  redis.on("connect", () => {
    logger.info("✅ Redis conectado");
  });

  return redis;
}

export function createCache({ redis }) {
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (!ttlSeconds) return redis.set(key, value);
      return redis.set(key, value, "EX", ttlSeconds);
    },
    async del(key) {
      return redis.del(key);
    },
    async expire(key, ttlSeconds) {
      return redis.expire(key, ttlSeconds);
    },
    async incrByFloat(key, n) {
      // ioredis suporta INCRBYFLOAT
      return redis.incrbyfloat(key, n);
    },
  };
}
