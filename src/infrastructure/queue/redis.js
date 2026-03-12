// src/infrastructure/queue/redis.js
// Usa REDIS_URL para evitar ECONNREFUSED em produção (ex: Render sem Redis local).

import { Redis } from "ioredis";

function isRedisDisabled() {
  return String(process.env.DISABLE_REDIS || "").toLowerCase() === "true";
}

function getRedisUrl() {
  return String(process.env.REDIS_URL || "").trim();
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

let redisInstance = null;
const url = getRedisUrl();
const isLocalDev = ["development", "dev", "local"].includes(String(process.env.NODE_ENV || "").toLowerCase());
const skipLocalhost = !isLocalDev && isLocalhostUrl(url);

if (url && !isRedisDisabled() && !skipLocalhost) {
  redisInstance = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
  });
}

export const redis = redisInstance;
