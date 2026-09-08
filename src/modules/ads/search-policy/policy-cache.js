// src/modules/ads/search-policy/policy-cache.js
//
// Cache do Search Policy Engine (instrução A da F2 + E4).
//
// Backends, escolhidos em runtime a cada chamada:
//   • Redis — o MESMO cliente de src/infrastructure/cache/redis.js que o
//     cache.middleware.js usa (`redis` é null sem REDIS_URL, com
//     DISABLE_REDIS=true ou com localhost fora de desenvolvimento).
//   • Memória — LRU do processo, máximo 200 chaves (E4: heap de 256 MB),
//     TTL por entrada, sem timers (nada mantém o processo vivo). Evicção:
//     expirado na leitura + o menos recentemente usado ao passar do teto.
//
// Em produção HOJE (`/health` → redis: disabled) o backend é memória: cada
// instância tem o seu, perdido no deploy. O relatório declara isso.
//
// Nenhum código pode assumir Redis (regra da F2). `cache.middleware.js` não é
// tocado — este módulo só reutiliza o cliente exportado por redis.js.
//
// Chaves: `sp:liq:*` (liquidez, TTL 900 s) e `sp:relax:*` (relaxações, 60 s).
// Invalidação por prefixo é chamada de ads.mutation-cache.js, no mesmo ponto
// dos prefixos legados.

import { redis } from "../../../infrastructure/cache/redis.js";
import { logger } from "../../../shared/logger.js";

export const POLICY_CACHE_PREFIX = Object.freeze({
  LIQUIDITY: "sp:liq",
  RELAXATIONS: "sp:relax",
});

export const POLICY_CACHE_MAX_KEYS = 200;

/** LRU: Map preserva ordem de inserção; reinserir no acesso move para o fim. */
const memory = new Map();

function memoryGet(key) {
  const entry = memory.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  memory.delete(key);
  memory.set(key, entry);
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  if (memory.has(key)) memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (memory.size > POLICY_CACHE_MAX_KEYS) {
    const oldest = memory.keys().next().value;
    memory.delete(oldest);
  }
}

function memoryInvalidatePrefix(prefix) {
  let n = 0;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(`${prefix}:`) || key === prefix) {
      memory.delete(key);
      n += 1;
    }
  }
  return n;
}

function redisClient() {
  return redis || null;
}

/** "redis" | "memory" — declarado no relatório e na telemetria. */
export function policyCacheBackend() {
  return redisClient() ? "redis" : "memory";
}

export async function policyCacheGet(key) {
  const client = redisClient();
  if (!client) return memoryGet(key);
  try {
    const raw = await client.get(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "[policy-cache] GET falhou; seguindo sem cache");
    return undefined;
  }
}

export async function policyCacheSet(key, value, ttlSeconds) {
  const ttl = Math.max(1, Math.floor(Number(ttlSeconds) || 1));
  const client = redisClient();
  if (!client) {
    memorySet(key, value, ttl);
    return;
  }
  try {
    await client.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "[policy-cache] SET falhou; seguindo sem cache");
  }
}

/** Mesma estratégia do cache.middleware (SCAN + DEL) no Redis; varredura no Map. */
export async function policyCacheInvalidatePrefix(prefix) {
  const client = redisClient();
  if (!client) return memoryInvalidatePrefix(prefix);
  let cursor = "0";
  let removed = 0;
  try {
    do {
      const [next, keys] = await client.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", 200);
      cursor = next;
      if (keys?.length) removed += await client.del(keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.warn({ err: err?.message, prefix }, "[policy-cache] invalidação falhou");
  }
  return removed;
}

/** Invalida os dois prefixos do motor — chamado após mutação de anúncio. */
export async function invalidateSearchPolicyCaches() {
  await Promise.allSettled([
    policyCacheInvalidatePrefix(POLICY_CACHE_PREFIX.LIQUIDITY),
    policyCacheInvalidatePrefix(POLICY_CACHE_PREFIX.RELAXATIONS),
  ]);
}

/** Só para testes: zera o LRU e expõe o tamanho. */
export const __policyCacheTesting = Object.freeze({
  reset() {
    memory.clear();
  },
  size() {
    return memory.size;
  },
  keys() {
    return [...memory.keys()];
  },
});
