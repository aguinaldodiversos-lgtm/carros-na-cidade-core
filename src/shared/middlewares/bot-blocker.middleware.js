// src/shared/middlewares/bot-blocker.middleware.js
//
// Bloqueio emergencial de crawlers conhecidos. Controlado por env:
//   BAD_BOTS_BLOCKED=true
//
// Default OFF. Quando ON, requests cujo User-Agent casa com a blocklist
// abaixo recebem:
//   - HTTP 429
//   - Retry-After: 86400
//   - Cache-Control: no-store
//   - corpo mínimo {"error":"rate_limited"}
//
// Por que 429 e não 403:
//   - 429 é honesto sobre o motivo (taxa);
//   - bots respeitam Retry-After;
//   - menos atrito com policy de busca caso o UA seja revertido.
//
// Googlebot e Bingbot NÃO entram na blocklist neste PR — eles trazem SEO
// real. Se excederem, o rate limit por endpoint cuida (separadamente).

const BAD_BOT_UA_PATTERN = new RegExp(
  [
    // SEO scrapers (alta taxa, baixo valor)
    "AhrefsBot",
    "SemrushBot",
    "MJ12bot",
    "BLEXBot",
    "DotBot",
    "DataForSeoBot",
    "MegaIndex",
    "serpstatbot",
    "ImagesiftBot",
    // Bots de buscadores chineses/russos (alto tráfego, baixo retorno BR)
    "Bytespider",
    "PetalBot",
    "YandexBot",
    "Baiduspider",
    // AI crawlers (escolha de negócio — sem opt-in)
    "GPTBot",
    "ClaudeBot",
    "CCBot",
    "Amazonbot",
    "Applebot-Extended",
    "FacebookBot",
    "anthropic-ai",
    // Clients HTTP genéricos (curl/python/etc) — usam UA default
    "python-requests",
    "python-urllib",
    "curl/",
    "Wget/",
    "axios/",
    "node-fetch",
    "Go-http-client",
    "Java/",
    "okhttp/",
    "Scrapy/",
    "HeadlessChrome",
  ].join("|"),
  "i"
);

// Whitelist de UAs que NUNCA bloqueamos (Googlebot real, Bingbot, monitoring
// interno). Tem precedência sobre a blocklist se ambos casarem por acaso.
const GOOD_BOT_UA_PATTERN = new RegExp(
  ["Googlebot", "Bingbot", "DuckDuckBot", "facebookexternalhit", "WhatsApp"].join("|"),
  "i"
);

export function isBadBot(userAgent) {
  if (!userAgent) return false;
  const ua = String(userAgent);
  if (GOOD_BOT_UA_PATTERN.test(ua)) return false;
  return BAD_BOT_UA_PATTERN.test(ua);
}

function isEnabled() {
  return process.env.BAD_BOTS_BLOCKED === "true";
}

/**
 * Paths que NÃO passam pelo blocker mesmo com a flag ligada — health checks,
 * robots, probes do Render. Manter pequeno.
 */
const ALLOWLIST_PATHS = [/^\/health/i, /^\/metrics$/i, /^\/robots\.txt$/i, /^\/$/];

function isAllowlistedPath(req) {
  const path = (req.path || req.url || "").split("?")[0];
  return ALLOWLIST_PATHS.some((re) => re.test(path));
}

export function botBlockerMiddleware(req, res, next) {
  if (!isEnabled()) return next();
  if (isAllowlistedPath(req)) return next();

  const ua = req.headers["user-agent"] || "";
  if (!isBadBot(ua)) return next();

  res.set("Retry-After", "86400");
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res.status(429).json({ error: "rate_limited" });
}
