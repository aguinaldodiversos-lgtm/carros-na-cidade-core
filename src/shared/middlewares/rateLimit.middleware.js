import rateLimit from "express-rate-limit";

/**
 * Extrai o IP real do cliente para rate limit, bot blocker e 404 storm guard.
 *
 * Ordem de prioridade (do mais confiável para o menos):
 *   1. `CF-Connecting-IP`        — Cloudflare na frente do origin. É o IP
 *                                  do visitante real, não da edge CF.
 *   2. `X-Cnc-Client-Ip`         — header injetado pelo BFF (Next.js SSR)
 *                                  com o IP do visitante real. Sem isso,
 *                                  todo tráfego compartilharia o IP do
 *                                  servidor do portal.
 *   3. `X-Forwarded-For` (1º IP) — proxy padrão. Pode ser spoofado, mas
 *                                  como o `trust proxy` do Express está em
 *                                  1 (Render é o único hop confiável), o
 *                                  primeiro IP é o cliente original.
 *   4. `req.ip` / socket          — fallback.
 *
 * Importante: NÃO usar apenas o IP da borda Cloudflare como identidade do
 * cliente — todos os bots dividiriam o mesmo IP de edge e o rate limit
 * cortaria humanos junto.
 */
export function clientRateLimitKey(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (cf) {
    const trimmed = String(cf).trim();
    if (trimmed) return trimmed;
  }

  const bff = req.headers["x-cnc-client-ip"];
  if (bff) {
    const trimmed = String(bff).trim();
    if (trimmed) return trimmed;
  }

  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const first = String(xff).split(",")[0].trim();
    if (first) return first;
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientRateLimitKey(req),
  message: {
    error: "Muitas tentativas. Tente novamente mais tarde.",
  },
});

/** Mesmo critério de IP do login (BFF + visitante real). */
export const registerRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => clientRateLimitKey(req),
  message: {
    error: "Muitas tentativas. Tente novamente mais tarde.",
  },
});

/**
 * Rate limit generoso para endpoints de autocomplete (cidades, busca).
 * Protege contra abuso real sem bloquear digitação normal no autocomplete.
 * 120 requests por minuto por IP é suficiente para uso intenso (debounce ≥250ms → ~4 req/s max).
 */
export const autocompleteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `autocomplete:${clientRateLimitKey(req)}`,
  message: {
    success: false,
    message: "Muitas buscas em sequência. Aguarde alguns segundos.",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limits específicos por endpoint pesado (2026-05-14, terceira iteração
// do fix de bandwidth). O limit global (1000 req/15min) permite ~1.1 req/s
// sustentado por IP — suficiente pra um bot ferrar listagens/sitemap em
// algumas horas. Estes limits são curtos (janela de 60s) e específicos por
// endpoint pra cortar o sangramento sem atrapalhar usuário humano.
//
// Resposta padrão: 429 + Retry-After dinâmico (via standardHeaders) + corpo
// mínimo. Sem HTML/JSON volumoso, mesmo na resposta de bloqueio.
//
// Valores:
//   - sitemap*       :  5 req/min  (humanos não acessam sitemap.xml)
//   - vehicle-images : 10 req/min  (redirect 302, baixo custo, ok ser baixo)
//   - ads (geral)    : 30 req/min  (humano clica devagar; mapa frontend chama
//                                   /api/ads/* em background com cache 30-60s)
//   - ads/search     : 20 req/min  (mais pesado que listagem; bots adoram)
//   - public/cities  : 30 req/min  (BFF cacheado deve evitar; bots ferrarão)
//   - search         : 20 req/min  (idem)
// ─────────────────────────────────────────────────────────────────────────────

function buildPerMinuteLimit(prefix, max) {
  return rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${prefix}:${clientRateLimitKey(req)}`,
    handler(req, res) {
      res.set("Cache-Control", "no-store");
      res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return res.status(429).json({ error: "rate_limited" });
    },
  });
}

export const sitemapRateLimit = buildPerMinuteLimit("sitemap", 5);
export const vehicleImagesRateLimit = buildPerMinuteLimit("vehicle-images", 10);
export const adsListRateLimit = buildPerMinuteLimit("ads-list", 30);
export const adsSearchRateLimit = buildPerMinuteLimit("ads-search", 20);
export const publicCitiesRateLimit = buildPerMinuteLimit("public-cities", 30);
export const searchRateLimit = buildPerMinuteLimit("search", 20);
export const uploadsRateLimit = buildPerMinuteLimit("uploads", 5);
