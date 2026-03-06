import { getLogger } from "../logger.js";

export function httpLoggerMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  const requestId = req.requestId || req.headers["x-request-id"] || null;

  const log = getLogger({
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
  });

  let finished = false;

  function buildPayload(eventType) {
    const durationNs = process.hrtime.bigint() - startedAt;
    const durationMs = Number(durationNs) / 1_000_000;

    return {
      eventType,
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      route: req.route?.path || undefined,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      contentLength: res.getHeader("content-length") || undefined,
      referer: req.headers.referer || req.headers.referrer || undefined,
    };
  }

  res.on("finish", () => {
    finished = true;

    const payload = buildPayload("finish");
    const statusCode = res.statusCode;

    if (statusCode >= 500) {
      log.error(payload, "[http] Request completed with server error");
      return;
    }

    if (statusCode >= 400) {
      log.warn(payload, "[http] Request completed with client error");
      return;
    }

    log.info(payload, "[http] Request completed");
  });

  res.on("close", () => {
    if (finished) return;

    const payload = buildPayload("close");
    log.warn(payload, "[http] Request connection closed before finish");
  });

  next();
}
