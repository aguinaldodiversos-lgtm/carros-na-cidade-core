// src/shared/logger.js
import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

// Logger padrão do sistema (JSON em prod, pretty em dev)
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  base: {
    service: process.env.SERVICE_NAME || "carros-na-cidade-core",
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

export default logger;
