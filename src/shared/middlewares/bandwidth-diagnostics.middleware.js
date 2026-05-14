// src/shared/middlewares/bandwidth-diagnostics.middleware.js
//
// Diagnóstico de outbound bandwidth do backend, controlado por env:
//   BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED=true
//
// Cada request é contabilizada em bytes (via wrap de res.write/end). A cada
// janela de 60s, é emitido UM evento JSON em stdout com agregados:
//   - top route_groups por bytes
//   - top paths normalizados (IDs e slugs anônimos) por bytes
//   - top user-agents por requests
//   - distribuição de status codes
//   - total bytes / total requests da janela
//
// Não loga: body, headers, cookies, authorization, tokens, IPs em claro.
// IP é hash SHA-1 de 10 bytes (pseudonímia leve, suficiente pra agrupar
// scrapers sem identificar usuário).
//
// Pensado para ficar LIGADO por 30-60 minutos durante triagem; depois
// DESLIGAR via env. O custo de CPU é desprezível, mas o log volumoso.

import crypto from "node:crypto";

const WINDOW_MS = 60_000;
const TOP_N = 10;

function isEnabled() {
  return process.env.BACKEND_BANDWIDTH_DIAGNOSTICS_ENABLED === "true";
}

/**
 * Normaliza um path substituindo segmentos que parecem ID/UUID/slug por placeholders.
 * Mantém prefixo de API mas evita explosão de cardinalidade no agregado.
 *
 * Exemplos:
 *   /api/ads/abc-123-def      → /api/ads/:id
 *   /api/public/cities/sp-sp  → /api/public/cities/:slug
 *   /api/vehicle-images       → /api/vehicle-images
 */
// Nomes de segmentos de rota canônicos do app — nunca substituir por :slug,
// mesmo que tenham hífen. Mantém o agregado legível.
const RESERVED_ROUTE_SEGMENTS = new Set([
  "vehicle-images",
  "dealer-acquisition",
  "ad-events",
  "blog-page",
  "internal-links",
]);

function looksLikeSlug(seg) {
  if (!/^[a-z0-9-]+$/i.test(seg)) return false;
  if (!seg.includes("-")) return false;
  if (RESERVED_ROUTE_SEGMENTS.has(seg.toLowerCase())) return false;
  // Slug "real" — pelo menos 2 hífens (sao-paulo-sp) OU termina com UF
  // de 2 letras (atibaia-sp) OU contém dígito ($brand-2020).
  if ((seg.match(/-/g) || []).length >= 2) return true;
  if (/-[a-z]{2}$/i.test(seg)) return true;
  if (/\d/.test(seg)) return true;
  return false;
}

export function normalizePathForAggregation(rawPath) {
  if (!rawPath) return "/";
  const path = rawPath.split("?")[0] || "/";
  return path
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      // UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
        return ":uuid";
      }
      // hexadecimal longo (storage keys, hashes)
      if (/^[0-9a-f]{16,}$/i.test(seg)) return ":hex";
      // só dígitos
      if (/^\d+$/.test(seg)) return ":id";
      // slug territorial / dinâmico
      if (looksLikeSlug(seg)) return ":slug";
      return seg;
    })
    .join("/");
}

/**
 * Categoriza um path normalizado em um route_group. Mantém a lista curta
 * para o agregado ficar legível.
 */
export function classifyRouteGroup(normalizedPath) {
  if (!normalizedPath) return "other";
  if (normalizedPath.startsWith("/api/public/seo/sitemap")) return "sitemap";
  if (normalizedPath.startsWith("/api/public/seo")) return "public_seo";
  if (normalizedPath.startsWith("/api/vehicle-images")) return "vehicle_images";
  if (normalizedPath.startsWith("/api/ads/search")) return "ads_search";
  if (normalizedPath.startsWith("/api/ads/facets")) return "ads_facets";
  if (normalizedPath.startsWith("/api/ads")) return "ads";
  if (normalizedPath.startsWith("/api/public/cities")) return "public_city";
  if (normalizedPath.startsWith("/api/public/regions")) return "public_region";
  if (normalizedPath.startsWith("/api/public")) return "public_other";
  if (normalizedPath.startsWith("/api/search")) return "search";
  if (normalizedPath.startsWith("/uploads")) return "uploads";
  if (normalizedPath.startsWith("/api/auth")) return "auth";
  if (normalizedPath.startsWith("/api/account")) return "account";
  if (normalizedPath.startsWith("/api/admin")) return "admin";
  if (normalizedPath === "/health" || normalizedPath.startsWith("/health")) return "health";
  if (normalizedPath === "/metrics") return "health";
  if (normalizedPath === "/robots.txt") return "robots";
  return "other";
}

/**
 * Resumo de user-agent. Mantém apenas categoria + 60 chars; nunca o UA full.
 */
export function summarizeUserAgent(ua) {
  if (!ua) return "(none)";
  const s = String(ua);
  if (/googlebot/i.test(s)) return "bot:google";
  if (/bingbot/i.test(s)) return "bot:bing";
  if (/AhrefsBot/i.test(s)) return "bot:ahrefs";
  if (/SemrushBot/i.test(s)) return "bot:semrush";
  if (/Bytespider/i.test(s)) return "bot:bytespider";
  if (/PetalBot/i.test(s)) return "bot:petal";
  if (/MJ12bot/i.test(s)) return "bot:mj12";
  if (/BLEXBot/i.test(s)) return "bot:blex";
  if (/DotBot/i.test(s)) return "bot:dot";
  if (/DataForSeoBot/i.test(s)) return "bot:dataforseo";
  if (/GPTBot|ClaudeBot|CCBot|Amazonbot/i.test(s)) return "bot:ai-crawler";
  if (/YandexBot/i.test(s)) return "bot:yandex";
  if (/Baiduspider/i.test(s)) return "bot:baidu";
  if (/HeadlessChrome/i.test(s)) return "bot:headless-chrome";
  if (/python-requests|curl\/|wget|axios|node-fetch|Go-http-client|Java\/|Scrapy/i.test(s)) {
    return "tool:http-client";
  }
  if (/Chrome\//.test(s)) return "browser:chrome";
  if (/Firefox\//.test(s)) return "browser:firefox";
  if (/Safari\//.test(s) && !/Chrome\//.test(s)) return "browser:safari";
  return `other:${s.slice(0, 60).replace(/\s+/g, " ")}`;
}

function hashIp(ip) {
  if (!ip) return "(none)";
  return crypto.createHash("sha1").update(String(ip)).digest("hex").slice(0, 10);
}

function summarizeReferer(referer) {
  if (!referer) return null;
  try {
    const u = new URL(String(referer));
    return u.host;
  } catch {
    return String(referer).slice(0, 60);
  }
}

// ─── Acumulador em memória ────────────────────────────────────────────────────

function createAccumulator() {
  return {
    startedAt: Date.now(),
    requests: 0,
    bytesTotal: 0,
    byRouteGroup: new Map(),
    byPath: new Map(),
    byUa: new Map(),
    byStatus: new Map(),
    byBotIp: new Map(),
  };
}

let accumulator = createAccumulator();
let flushTimer = null;

function bumpMap(map, key, bytes) {
  const cur = map.get(key) || { count: 0, bytes: 0 };
  cur.count += 1;
  cur.bytes += bytes;
  map.set(key, cur);
}

function topEntries(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, n)
    .map(([key, value]) => ({ key, count: value.count, bytes: value.bytes }));
}

function topByCount(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, n)
    .map(([key, value]) => ({ key, count: value.count, bytes: value.bytes }));
}

export function flushAccumulator(now = Date.now()) {
  if (accumulator.requests === 0) {
    accumulator = createAccumulator();
    return null;
  }

  const summary = {
    event: "backend_bandwidth",
    window_start: new Date(accumulator.startedAt).toISOString(),
    window_end: new Date(now).toISOString(),
    window_ms: now - accumulator.startedAt,
    total_requests: accumulator.requests,
    total_bytes: accumulator.bytesTotal,
    top_route_groups: topEntries(accumulator.byRouteGroup, TOP_N),
    top_paths: topEntries(accumulator.byPath, TOP_N),
    top_user_agents: topByCount(accumulator.byUa, TOP_N),
    status_codes: [...accumulator.byStatus.entries()]
      .map(([code, v]) => ({ code, count: v.count, bytes: v.bytes }))
      .sort((a, b) => b.count - a.count),
    top_bot_ip_hashes: topByCount(accumulator.byBotIp, TOP_N),
  };

  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary));
  } catch {
    // log nunca pode derrubar o processo
  }

  accumulator = createAccumulator();
  return summary;
}

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    if (!isEnabled()) return;
    flushAccumulator();
  }, WINDOW_MS);
  // não bloquear shutdown
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

function stopFlushTimer() {
  if (!flushTimer) return;
  clearInterval(flushTimer);
  flushTimer = null;
}

/** Exposto pra testes. Reset do estado interno. */
export function __resetForTests() {
  stopFlushTimer();
  accumulator = createAccumulator();
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function countBytes(chunk) {
  if (!chunk) return 0;
  if (Buffer.isBuffer(chunk)) return chunk.length;
  if (typeof chunk === "string") return Buffer.byteLength(chunk);
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

export function bandwidthDiagnosticsMiddleware(req, res, next) {
  if (!isEnabled()) return next();
  ensureFlushTimer();

  let bytes = 0;

  const origWrite = res.write.bind(res);
  res.write = function patchedWrite(chunk, ...rest) {
    bytes += countBytes(chunk);
    return origWrite(chunk, ...rest);
  };

  const origEnd = res.end.bind(res);
  res.end = function patchedEnd(chunk, ...rest) {
    bytes += countBytes(chunk);
    return origEnd(chunk, ...rest);
  };

  res.on("finish", () => {
    try {
      const rawPath = req.originalUrl || req.url || "/";
      const normalizedPath = normalizePathForAggregation(rawPath);
      const group = classifyRouteGroup(normalizedPath);
      const ua = summarizeUserAgent(req.headers["user-agent"]);
      const status = String(res.statusCode);

      accumulator.requests += 1;
      accumulator.bytesTotal += bytes;
      bumpMap(accumulator.byRouteGroup, group, bytes);
      bumpMap(accumulator.byPath, `${req.method} ${normalizedPath}`, bytes);
      bumpMap(accumulator.byUa, ua, bytes);
      bumpMap(accumulator.byStatus, status, bytes);

      if (ua.startsWith("bot:") || ua.startsWith("tool:")) {
        const ipHash = hashIp(req.ip || req.headers["x-forwarded-for"] || "");
        bumpMap(accumulator.byBotIp, `${ua}@${ipHash}`, bytes);
      }

      // Para casos isolados de payload muito alto (>512 KB), loga linha
      // individual além do agregado — ajuda a achar o tiro que detonou.
      if (bytes > 512 * 1024) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            event: "backend_bandwidth_spike",
            method: req.method,
            path: normalizedPath,
            route_group: group,
            status: res.statusCode,
            bytes,
            user_agent: ua,
            referer: summarizeReferer(req.headers.referer),
            ip_hash: hashIp(req.ip || req.headers["x-forwarded-for"] || ""),
          })
        );
      }
    } catch {
      // diagnóstico nunca pode derrubar request
    }
  });

  next();
}
