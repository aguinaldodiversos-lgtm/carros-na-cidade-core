import { getLogger } from "../logger.js";
import { query } from "../../infrastructure/database/db.js";
import { features } from "../config/features.js";

// ─────────────────────────────────────────────────────────────────────────────
// Política de gravação em public.request_audit_logs
//
// Histórico: em 2026-05-13 esta tabela cresceu para ~53.6M linhas / 15 GB e
// suspendeu o Postgres do Render. Causa raiz: middleware gravava 100% das
// requisições (incluindo /health, /api/vehicle-images/*, /uploads/*, favicon,
// sitemap…) sem amostragem nem retenção, e o default do flag aqui era "true"
// — contrariando o default `false` em src/shared/config/features.js.
//
// Política atual (fail-closed):
//   1. Default OFF. Só liga via REQUEST_AUDIT_LOGS_ENABLED=true.
//   2. Mesmo ligado, paths "ruidosos" (health, uploads, assets, imagens,
//      sitemap/robots, OPTIONS) nunca são gravados.
//   3. Amostragem: 2xx/3xx é gravado em fração configurável (default 1%).
//      4xx/5xx é gravado sempre (ajuda investigação de incidentes).
//   4. Campos sensíveis: user-agent é truncado em 256 chars; path em 512.
//      Nunca gravamos body, headers, cookies, authorization.
//   5. Retenção: scripts/maintenance/prune-request-audit-logs.mjs roda em
//      cron e apaga linhas mais velhas que REQUEST_AUDIT_RETENTION_DAYS.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PATH_LEN = 512;
const MAX_UA_LEN = 256;

function parseSampleRate(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n > 1) return 1;
  return n;
}

const SAMPLE_RATE_SUCCESS = parseSampleRate(
  process.env.REQUEST_AUDIT_SAMPLE_SUCCESS_RATE,
  0.01 // 1% de 2xx/3xx
);

// Paths que NUNCA vão para o audit log, mesmo com a flag ligada.
// Mantemos como regex para casar rotas com parâmetros (e.g. /api/vehicle-images/123).
const IGNORED_PATH_PATTERNS = [
  /^\/health\b/i,
  /^\/healthz\b/i,
  /^\/ready\b/i,
  /^\/live\b/i,
  /^\/ping\b/i,
  /^\/metrics\b/i,
  /^\/favicon\.ico$/i,
  /^\/robots\.txt$/i,
  /^\/sitemap.*\.xml$/i,
  /^\/uploads(\/|$)/i,
  /^\/api\/vehicle-images(\/|$)/i,
  /^\/static(\/|$)/i,
  /^\/assets(\/|$)/i,
  /^\/images(\/|$)/i,
  /^\/img(\/|$)/i,
  /^\/_next(\/|$)/i,
  // extensões de asset comuns
  /\.(?:png|jpe?g|webp|gif|svg|ico|css|js|map|woff2?|ttf|otf|mp4|webm)(?:\?|$)/i,
];

export function isIgnoredAuditPath(path) {
  if (!path) return true;
  for (const re of IGNORED_PATH_PATTERNS) {
    if (re.test(path)) return true;
  }
  return false;
}

/**
 * Decisão pura sobre gravar (ou não) uma request no audit log.
 *
 * Exposto pra teste — `Math.random` é injetado via `rng` (default `Math.random`).
 *
 * Retorna `true` se a request DEVE ser gravada.
 */
export function shouldPersistAuditLog({
  featureEnabled,
  method,
  path,
  statusCode,
  sampleRate = SAMPLE_RATE_SUCCESS,
  rng = Math.random,
}) {
  if (!featureEnabled) return false;
  if (method === "OPTIONS") return false;
  if (isIgnoredAuditPath(path)) return false;
  if (statusCode >= 400) return true; // 4xx/5xx: sempre
  return rng() < sampleRate;
}

function truncate(value, max) {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export const __TEST__ = {
  SAMPLE_RATE_SUCCESS,
  MAX_PATH_LEN,
  MAX_UA_LEN,
  truncate,
};

async function persistRequestAuditLog({
  requestId,
  method,
  path,
  statusCode,
  durationMs,
  ip,
  userAgent,
}) {
  if (
    !shouldPersistAuditLog({
      featureEnabled: features.requestAuditLogs,
      method,
      path,
      statusCode,
    })
  ) {
    return;
  }

  try {
    await query(
      `
      INSERT INTO request_audit_logs
        (request_id, method, path, status_code, duration_ms, ip_address, user_agent, created_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,NOW())
      `,
      [
        requestId,
        method,
        truncate(path, MAX_PATH_LEN),
        statusCode,
        durationMs,
        ip,
        truncate(userAgent, MAX_UA_LEN),
      ]
    );
  } catch {
    // best-effort — observabilidade nunca pode derrubar request
  }
}

export function httpLoggerMiddleware(req, res, next) {
  const start = Date.now();

  const requestId = req.requestId || req.headers["x-request-id"] || null;
  const path = req.originalUrl || req.url;

  const log = getLogger({
    requestId,
    method: req.method,
    path,
  });

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    log[level](
      {
        statusCode,
        durationMs,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null,
      },
      "HTTP request"
    );

    persistRequestAuditLog({
      requestId,
      method: req.method,
      path,
      statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
    }).catch(() => {});
  });

  next();
}
