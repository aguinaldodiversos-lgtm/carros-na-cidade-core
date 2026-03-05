// src/shared/logger.js

import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/*
-------------------------------------------------------
LOGGER PRINCIPAL
-------------------------------------------------------
*/

const logger = pino({
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

/*
-------------------------------------------------------
EXPORTS
-------------------------------------------------------
*/

export { logger };

export function getLogger(scope = "app") {
  return logger.child({ scope });
}

export default logger;
