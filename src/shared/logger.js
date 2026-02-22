// src/shared/logger.js

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const transport = isDev
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    }
  : undefined;

export const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: {
      service: "carros-na-cidade-api",
      env: process.env.NODE_ENV || "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport ? pino.transport(transport) : undefined
);

/**
 * Cria logger contextual por requisição
 */
export function getLogger(req) {
  return baseLogger.child({
    requestId: req?.requestId,
    path: req?.originalUrl,
    method: req?.method,
  });
}
