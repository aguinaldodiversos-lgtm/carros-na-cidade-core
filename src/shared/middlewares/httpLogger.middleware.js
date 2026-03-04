// src/shared/middlewares/httpLogger.middleware.js
import { getLogger } from "../logger.js";

export function httpLoggerMiddleware(req, res, next) {
  const start = Date.now();

  const requestId = req.requestId || req.headers["x-request-id"];
  const log = getLogger({
    requestId,
    method: req.method,
    path: req.originalUrl || req.url,
  });

  res.on("finish", () => {
    const durationMs = Date.now() - start;

    const statusCode = res.statusCode;
    const level =
      statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    log[level]({
      message: "HTTP request",
      statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  });

  next();
}
