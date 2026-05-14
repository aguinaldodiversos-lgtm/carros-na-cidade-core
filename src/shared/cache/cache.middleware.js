import { redis } from "../../infrastructure/cache/redis.js";
import crypto from "crypto";

function stableStringify(obj) {
  const keys = Object.keys(obj || {}).sort();
  const sorted = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

/**
 * Filtra `req.query` para conter apenas as chaves explicitamente permitidas.
 *
 * Por que: bots variam query params lixo (`?utm_*`, `?fbclid=`, `?_=timestamp`)
 * para forçar cache MISS e bater o origin. Sem whitelist, `varyBy=["query"]`
 * cria uma cache key distinta por combinação — efeito conhecido como
 * "cache key explosion". Com whitelist, params desconhecidos são ignorados
 * na key (e a resposta cacheada é reutilizada).
 *
 * Filtros legítimos (page, limit, brand, model, etc.) PRECISAM estar listados
 * pra continuar variando o cache corretamente. Default (allowedQueryKeys
 * ausente ou null) preserva o comportamento antigo — sem filtragem.
 */
function filterQuery(query, allowed) {
  if (!allowed) return query;
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      out[key] = query[key];
    }
  }
  return out;
}

export function cacheGet({ prefix, ttlSeconds = 60, varyBy = ["query"], allowedQueryKeys = null }) {
  return async (req, res, next) => {
    try {
      if (!redis) return next();

      // Só cacheia GET
      if (req.method !== "GET") return next();

      const vary = {};
      if (varyBy.includes("query")) vary.query = filterQuery(req.query, allowedQueryKeys);
      if (varyBy.includes("params")) vary.params = req.params;

      const raw = `${prefix}:${req.path}:${stableStringify(vary)}`;
      const key = `${prefix}:${crypto.createHash("sha1").update(raw).digest("hex")}`;

      const cached = await redis.get(key);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        res.setHeader("Cache-Control", `public, max-age=${ttlSeconds}`);
        return res.status(200).json(JSON.parse(cached));
      }

      // Monkey patch res.json para gravar no cache
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Só cacheia respostas de sucesso: status 2xx e sem indicador de erro no payload.
        // Evita persistir fallback de safeMode (ok:false) ou respostas de erro do handler.
        const statusOk = res.statusCode >= 200 && res.statusCode < 400;
        const bodyOk = !body || body.ok !== false;
        if (statusOk && bodyOk) {
          Promise.resolve()
            .then(() => redis.set(key, JSON.stringify(body), "EX", ttlSeconds))
            .catch(() => {});
        }
        res.setHeader("X-Cache", "MISS");
        res.setHeader("Cache-Control", statusOk ? `public, max-age=${ttlSeconds}` : "no-store");
        return originalJson(body);
      };

      return next();
    } catch (err) {
      // Cache nunca pode derrubar a rota
      return next();
    }
  };
}

export async function cacheInvalidatePrefix(prefix) {
  if (!redis) return;

  // Estratégia simples: usar SCAN com match no prefixo
  // (para produção grande, migrar para Redis keyspace tags / sets)
  let cursor = "0";
  const match = `${prefix}:*`;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", match, "COUNT", 200);
    cursor = nextCursor;
    if (keys?.length) await redis.del(keys);
  } while (cursor !== "0");
}
