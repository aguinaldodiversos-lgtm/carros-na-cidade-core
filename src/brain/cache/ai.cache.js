import Redis from "ioredis";

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

export function createRedisClient({ logger }) {
  const url = String(process.env.REDIS_URL || "").trim();

  if (!url) {
    logger.warn("REDIS_URL ausente. Cache/Queue podem falhar em produção.");
    return null;
  }
  if (isRedisDisabled()) {
    logger.warn("DISABLE_REDIS=true. Cache AI desativado.");
    return null;
  }
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (isProd && isLocalhostUrl(url)) {
    logger.warn("REDIS_URL aponta para localhost em produção. Cache AI desativado.");
    return null;
  }
  const redis = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    logger.error(
      { error: err?.message || String(err) },
      "[brain.ai.cache] Redis error"
    );
  });

  redis.on("connect", () => {
    logger.info("[brain.ai.cache] Redis conectado");
  });

  return redis;
}

export function createCache({ redis }) {
  if (!redis) {
    return {
      async get() { return null; },
      async set() {},
      async del() {},
      async expire() {},
      async incrByFloat() { return 0; },
    };
  }
  return {
    async get(key) { return redis.get(key); },
    async set(key, value, ttlSeconds) {
      if (!ttlSeconds) return redis.set(key, value);
      return redis.set(key, value, "EX", ttlSeconds);
    },
    async del(key) { return redis.del(key); },
    async expire(key, ttlSeconds) { return redis.expire(key, ttlSeconds); },
    async incrByFloat(key, n) { return redis.incrbyfloat(key, n); },
  };
}
