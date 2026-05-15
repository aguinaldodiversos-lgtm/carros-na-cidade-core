// src/shared/middlewares/bot-blocker.middleware.js
//
// Bloqueio emergencial de crawlers e clients HTTP genéricos. Controlado por env:
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
// Googlebot e Bingbot NÃO entram na blocklist — eles trazem SEO real. Se
// excederem, o rate limit por endpoint cuida (separadamente).
//
// ─── Allowlist interna (cnc-internal/1.0) ────────────────────────────────────
// Chamadas internas legítimas (frontend SSR/BFF, scripts internos, healthchecks
// custom) DEVEM declarar:
//   User-Agent: cnc-internal/1.0
//   X-Internal-Token: <INTERNAL_API_TOKEN>
//
// Sem o token, o UA `cnc-internal/1.0` é tratado como qualquer outro — não
// dá pra burlar a proteção setando só o UA. O token vem da env
// INTERNAL_API_TOKEN (já existente no projeto, usado em /api/internal/regions).

const INTERNAL_UA_PATTERN = /^cnc-internal\//i;

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
    // Clients HTTP genéricos. `^node$` (UA literal "node", visto nos logs em
    // 2026-05-14, enumerando /catalog/ads/*, /public/listings/*, etc.) é
    // tratado em isBadBot — regex puro não casa âncoras dentro de alternation
    // amplo, então fazemos um teste extra abaixo.
    "node-fetch",
    "python-requests",
    "python-urllib",
    "curl/",
    "Wget/",
    "axios/",
    "Go-http-client",
    "Java/",
    "okhttp/",
    "Scrapy/",
    "HeadlessChrome",
  ].join("|"),
  "i"
);

// Whitelist de UAs que NUNCA bloqueamos (Googlebot real, Bingbot, monitoring
// público). Precedência sobre a blocklist se ambos casarem por acaso.
const GOOD_BOT_UA_PATTERN = new RegExp(
  ["Googlebot", "Bingbot", "DuckDuckBot", "facebookexternalhit", "WhatsApp"].join("|"),
  "i"
);

export function isBadBot(userAgent) {
  if (!userAgent) return false;
  const ua = String(userAgent);
  if (GOOD_BOT_UA_PATTERN.test(ua)) return false;
  // UA literal "node" (Node.js HTTP client default em algumas versões / scripts
  // axios/got que setam UA explicitamente). É só "node", sem versão nem barra.
  if (ua.trim().toLowerCase() === "node") return true;
  return BAD_BOT_UA_PATTERN.test(ua);
}

function isEnabled() {
  return process.env.BAD_BOTS_BLOCKED === "true";
}

function getInternalToken() {
  return process.env.INTERNAL_API_TOKEN || "";
}

/**
 * Resposta autoritativa: este request é uma chamada interna autenticada
 * (frontend SSR/BFF ou script interno)? Precisa do par UA + token.
 */
export function isAuthenticatedInternalCall(req) {
  const ua = req.headers["user-agent"] || "";
  if (!INTERNAL_UA_PATTERN.test(String(ua))) return false;

  const expectedToken = getInternalToken();
  if (!expectedToken) return false;

  const providedToken = req.headers["x-internal-token"] || "";
  return String(providedToken) === expectedToken;
}

/**
 * Compat fraca: o frontend Next.js BFF/SSR ainda não envia UA `cnc-internal/1.0`
 * (vai ser atualizado em PR separado). Enquanto isso, o BFF sempre marca o
 * IP real do visitante em `X-Cnc-Client-Ip` — header custom do projeto. Bots
 * externos não conhecem esse header.
 *
 * Quando ele está presente, tratamos UA `node` (default do fetch global do
 * Node 18+) como amigável. Isso é uma camada FRACA — pode ser spoofada — mas
 * é o que evita cortar o próprio frontend no curto prazo. O `X-Cnc-Client-Ip`
 * tem que parecer um IPv4/IPv6 minimamente válido pra valer.
 *
 * Caminho preferido permanece: UA cnc-internal/1.0 + X-Internal-Token.
 */
const IP_LIKE = /^[0-9a-f:.]{3,45}$/i;

export function looksLikeBffCall(req) {
  const ip = req.headers["x-cnc-client-ip"];
  if (!ip) return false;
  return IP_LIKE.test(String(ip).trim());
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

  // Caminho forte: UA cnc-internal/1.0 + X-Internal-Token correto.
  if (isAuthenticatedInternalCall(req)) return next();

  const ua = req.headers["user-agent"] || "";
  if (!isBadBot(ua)) return next();

  // Compat fraca: UA `node` puro + X-Cnc-Client-Ip presente → libera. Cobre o
  // frontend BFF/SSR enquanto não emite UA `cnc-internal/1.0`. Outras UAs da
  // blocklist (Ahrefs, python-requests, etc.) NÃO são liberadas por essa
  // brecha — só `node` puro, que é o caso real do nosso Next.js SSR.
  if (String(ua).trim().toLowerCase() === "node" && looksLikeBffCall(req)) {
    return next();
  }

  res.set("Retry-After", "86400");
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res.status(429).json({ error: "rate_limited" });
}
