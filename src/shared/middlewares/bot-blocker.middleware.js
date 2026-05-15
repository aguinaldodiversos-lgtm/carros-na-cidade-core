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
// Comparação via timingSafeEqual para evitar timing attacks.
//
// ─── Compat fraca (LEGACY_BFF_COMPAT) ────────────────────────────────────────
// Durante o incidente de bandwidth (2026-05) deixamos UA `node` + X-Cnc-Client-Ip
// passar como fallback enquanto o frontend ainda não emitia UA cnc-internal/1.0.
// Bots podem forjar `X-Cnc-Client-Ip`, então esse caminho é FRACO.
//
// A partir deste PR, a compat só fica disponível com `LEGACY_BFF_COMPAT=true` na
// env (default OFF em prod). Estado-alvo: frontend manda UA cnc-internal/1.0 e
// X-Internal-Token corretos, compat fica desligada permanentemente.

import { timingSafeEqual } from "node:crypto";

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
 * Comparação de tokens em tempo constante. Evita timing attacks por análise
 * de latência (improvável neste contexto, mas é trivial fazer certo).
 *
 * `timingSafeEqual` exige que os Buffers tenham o mesmo length, então
 * comparamos o length explicitamente primeiro (fast-fail nao vaza além do
 * que ja vazaria).
 */
function safeCompareTokens(provided, expected) {
  const a = String(provided || "");
  const b = String(expected || "");
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

let warnedMissingTokenInProd = false;
function warnMissingTokenInProductionOnce() {
  if (warnedMissingTokenInProd) return;
  if (process.env.NODE_ENV !== "production") return;
  warnedMissingTokenInProd = true;
  // Nao logamos o valor do token (nao temos), so o fato dele estar ausente.
  // eslint-disable-next-line no-console
  console.error(
    "[bot-blocker] INTERNAL_API_TOKEN ausente em producao: chamadas com UA cnc-internal/1.0 nao podem ser autenticadas e serao bloqueadas como 429 quando BAD_BOTS_BLOCKED=true. Configure a env no Render Dashboard > backend > Environment."
  );
}

let warnedInternalUaWithoutTokenInProd = false;
function warnInternalUaWithoutTokenOnce() {
  if (warnedInternalUaWithoutTokenInProd) return;
  if (process.env.NODE_ENV !== "production") return;
  warnedInternalUaWithoutTokenInProd = true;
  // eslint-disable-next-line no-console
  console.error(
    "[bot-blocker] UA cnc-internal/1.0 recebido SEM X-Internal-Token valido em producao. Possiveis causas: (a) frontend SSR/BFF deployou sem INTERNAL_API_TOKEN no env; (b) atacante tentando burlar bot blocker so com UA. Bloqueando como 429."
  );
}

/**
 * Resposta autoritativa: este request é uma chamada interna autenticada
 * (frontend SSR/BFF ou script interno)? Precisa do par UA + token.
 *
 * Retorna false em qualquer falha (token ausente, mismatch, UA divergente).
 * Emite warning UNICO em prod quando UA cnc-internal/1.0 chegar sem token
 * valido — isso facilita diagnostico sem floodar log a cada request.
 */
export function isAuthenticatedInternalCall(req) {
  const ua = req.headers["user-agent"] || "";
  if (!INTERNAL_UA_PATTERN.test(String(ua))) return false;

  const expectedToken = getInternalToken();
  if (!expectedToken) {
    warnMissingTokenInProductionOnce();
    return false;
  }

  const providedToken = req.headers["x-internal-token"] || "";
  const ok = safeCompareTokens(providedToken, expectedToken);
  if (!ok) {
    warnInternalUaWithoutTokenOnce();
  }
  return ok;
}

/**
 * Compat FRACA herdada do hotfix de bandwidth (2026-05). Permite UA `node`
 * (default do fetch global do Node 18+) bypassar quando vier acompanhado de
 * `X-Cnc-Client-Ip` minimamente valido.
 *
 * Por que e fraca: qualquer bot externo pode setar `X-Cnc-Client-Ip` com um
 * IP arbitrario. So o par UA `cnc-internal/1.0` + X-Internal-Token correto
 * autentica de verdade — `isAuthenticatedInternalCall`.
 *
 * Por que ainda existe: rollback de seguranca. Se o deploy do frontend que
 * passa a emitir UA cnc-internal/1.0 falhar (ex: env INTERNAL_API_TOKEN nao
 * sincronizada no Render), o SSR publico cairia em 429 imediatamente. Com a
 * flag LEGACY_BFF_COMPAT=true, voltamos a aceitar o caminho antigo por
 * algumas horas enquanto investigamos.
 *
 * Default agora: OFF em prod. Estado-alvo: remover de vez no proximo PR
 * depois de 48h validando metricas e ausencia de regressao.
 */
const IP_LIKE = /^[0-9a-f:.]{3,45}$/i;

function isLegacyBffCompatEnabled() {
  return process.env.LEGACY_BFF_COMPAT === "true";
}

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

  // Compat FRACA (LEGACY_BFF_COMPAT=true): UA `node` + X-Cnc-Client-Ip libera.
  // Disponivel apenas como rollback emergencial — o caminho normal e UA
  // cnc-internal/1.0 + X-Internal-Token. Outras UAs da blocklist (Ahrefs,
  // python-requests, etc.) NUNCA passam por aqui, so `node` puro.
  if (
    isLegacyBffCompatEnabled() &&
    String(ua).trim().toLowerCase() === "node" &&
    looksLikeBffCall(req)
  ) {
    return next();
  }

  res.set("Retry-After", "86400");
  res.set("Cache-Control", "no-store");
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res.status(429).json({ error: "rate_limited" });
}
