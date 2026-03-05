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
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * Retorna um child logger com contexto do módulo.
 * Mantém logs padronizados e facilita rastreabilidade.
 */
export function getLogger(context = {}) {
  if (typeof context === "string") return logger.child({ scope: context });
  return logger.child(context);
}

export default logger;
