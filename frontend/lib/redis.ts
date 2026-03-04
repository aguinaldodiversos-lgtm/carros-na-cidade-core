import "server-only";
import Redis from "ioredis";

declare global {
  var redisClient: Redis | undefined;
}

function getRedisUrl() {
  return process.env.REDIS_URL ?? "";
}

export function getRedisClient() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return null;
  }

  if (!globalThis.redisClient) {
    globalThis.redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  return globalThis.redisClient;
}
