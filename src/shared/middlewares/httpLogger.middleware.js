// src/shared/middlewares/httpLogger.middleware.js

import { getLogger } from "../logger.js";

export function httpLoggerMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const duration =
      Number(process.hrtime.bigint() - start) / 1_000_000;

    const logger = getLogger(req);

    logger.info({
      statusCode: res.statusCode,
      durationMs: duration.toFixed(2),
      event: "http_request",
    });
  });

  next();
}
