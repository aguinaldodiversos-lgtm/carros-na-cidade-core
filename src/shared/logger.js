// src/shared/logger.js

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const transport = isDev
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname"
      }
    }
  : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    base: {
      service: "carros-na-cidade-api",
      env: process.env.NODE_ENV || "development"
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err
    }
  },
  transport ? pino.transport(transport) : undefined
);
