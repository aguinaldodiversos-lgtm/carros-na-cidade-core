// src/shared/middlewares/404-storm-guard.middleware.js
//
// Controlado por env: PUBLIC_404_STORM_GUARD_ENABLED=true. Default OFF.
//
// Conta 404s recentes por (IP, UA). Quando um par excede o threshold em 60s,
// passa a responder 429 leve por uma janela longa (1h por default). Útil para
// bots que enumeram rotas falsas — eles geram 404 atrás de 404, e cada um
// custa CPU + log + body de erro.
//
// Strategy:
//   - counter em memória (Map). Bom o bastante pra single-instance Render
//     (uma máquina) com volume típico < 1k IPs distintos/min.
//   - Cleanup oportunista (gc roda a cada hit, sem timers).
//
// Não conta 404s em /health, /metrics, /robots.txt (allowlist por path).
//
// Quando bloqueia, emite linha estruturada em stdout:
//   {"event":"public_404_storm_blocked","ua_summary":"...","ip_hash":"...",
//    "count_404":N,"sample_path":"..."}

import crypto from "node:crypto";

import { clientRateLimitKey } from "./rateLimit.middleware.js";
import { summarizeUserAgent } from "./bandwidth-diagnostics.middleware.js";

const COUNT_WINDOW_MS = 60_000;
const DEFAULT_THRESHOLD = 15; // 404s em 60s → bloqueia
const BLOCK_DURATION_MS = 60 * 60_000; // 1h
const MAX_TRACKED_KEYS = 5000; // cap pra memória

const ALLOWLIST_PATHS = [/^\/health/i, /^\/metrics$/i, /^\/robots\.txt$/i, /^\/$/];

function isEnabled() {
  return process.env.PUBLIC_404_STORM_GUARD_ENABLED === "true";
}

function getThreshold() {
  const raw = Number(process.env.PUBLIC_404_STORM_THRESHOLD);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 1000);
  return DEFAULT_THRESHOLD;
}

function getBlockDurationMs() {
  const raw = Number(process.env.PUBLIC_404_STORM_BLOCK_SECONDS);
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw * 1000, 24 * 60 * 60_000);
  return BLOCK_DURATION_MS;
}

function isAllowlistedPath(req) {
  const path = (req.path || req.url || "").split("?")[0];
  return ALLOWLIST_PATHS.some((re) => re.test(path));
}

function hashIp(ip) {
  return crypto
    .createHash("sha1")
    .update(String(ip || ""))
    .digest("hex")
    .slice(0, 10);
}

// State: para cada chave (ip|ua), guardamos { hits: number[], blockedUntil: number }
const state = new Map();

function gcOldEntries(now) {
  if (state.size < MAX_TRACKED_KEYS) return;
  const cutoff = now - Math.max(COUNT_WINDOW_MS, BLOCK_DURATION_MS) * 2;
  for (const [k, v] of state.entries()) {
    const lastSeen = v.blockedUntil || (v.hits.length ? v.hits[v.hits.length - 1] : 0);
    if (lastSeen < cutoff) state.delete(k);
  }
}

function pruneHits(hits, now) {
  // remove hits anteriores à janela de 60s. usa filter — array pequeno.
  return hits.filter((t) => now - t <= COUNT_WINDOW_MS);
}

function getKey(req) {
  const ip = clientRateLimitKey(req);
  const ua = req.headers["user-agent"] || "(none)";
  // Trunca UA para evitar explosão de cardinalidade.
  return `${ip}|${String(ua).slice(0, 100)}`;
}

export function isBlocked(key, now = Date.now()) {
  const entry = state.get(key);
  if (!entry) return false;
  if (entry.blockedUntil && entry.blockedUntil > now) return true;
  return false;
}

/** Exposto pra testes. */
export function __resetForTests() {
  state.clear();
}

/** Exposto pra testes. */
export function __getState() {
  return state;
}

export function publicStormGuardMiddleware(req, res, next) {
  if (!isEnabled()) return next();
  if (isAllowlistedPath(req)) return next();

  const now = Date.now();
  const key = getKey(req);

  // Se já bloqueado, devolver 429 leve direto sem tocar router.
  if (isBlocked(key, now)) {
    res.set("Retry-After", String(Math.ceil(getBlockDurationMs() / 1000)));
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res.status(429).json({ error: "rate_limited" });
  }

  // Após a resposta, se foi 404, registra hit. Em volume alto, escalonar pra
  // 429 no PRÓXIMO request quando o threshold for atingido.
  res.on("finish", () => {
    try {
      if (res.statusCode !== 404) return;
      gcOldEntries(now);
      const entry = state.get(key) || { hits: [], blockedUntil: 0 };
      entry.hits = pruneHits(entry.hits, now);
      entry.hits.push(now);
      if (entry.hits.length >= getThreshold()) {
        entry.blockedUntil = now + getBlockDurationMs();
        const ip = clientRateLimitKey(req);
        const ua = req.headers["user-agent"] || "";
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            event: "public_404_storm_blocked",
            ua_summary: summarizeUserAgent(ua),
            ip_hash: hashIp(ip),
            count_404: entry.hits.length,
            sample_path: (req.originalUrl || req.url || "").slice(0, 200),
            block_seconds: Math.ceil(getBlockDurationMs() / 1000),
          })
        );
      }
      state.set(key, entry);
    } catch {
      // guard nunca pode derrubar request
    }
  });

  next();
}
