// src/shared/logger.js
import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  base: {
    service: process.env.SERVICE_NAME || "carros-na-cidade-core",
    env: process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isProd
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});

/**
 * API oficial para módulos que precisam de logger contextual
 * (mantém compatibilidade com imports antigos do tipo { getLogger }).
 */
export function getLogger(bindings = {}) {
  return logger.child(bindings);
}

export default logger;
