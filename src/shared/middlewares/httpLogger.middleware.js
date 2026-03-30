import { getLogger } from "../logger.js";
import { query } from "../../infrastructure/database/db.js";

const REQUEST_AUDIT_ENABLED =
  String(process.env.REQUEST_AUDIT_LOGS_ENABLED || "true").toLowerCase() === "true";

async function persistRequestAuditLog({
  requestId,
  method,
  path,
  statusCode,
  durationMs,
  ip,
  userAgent,
}) {
  if (!REQUEST_AUDIT_ENABLED) return;

  try {
    await query(
      `
      INSERT INTO request_audit_logs
        (request_id, method, path, status_code, duration_ms, ip_address, user_agent, created_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,NOW())
      `,
      [requestId, method, path, statusCode, durationMs, ip, userAgent]
    );
  } catch {
    // best-effort
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
