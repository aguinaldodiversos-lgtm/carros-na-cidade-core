import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

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

export { logger };

export function getLogger(context = {}) {
  if (!context) return logger;

  if (typeof context === "string") {
    return logger.child({ scope: context });
  }

  if (typeof context === "object") {
    return logger.child(context);
  }

  return logger;
}

export default logger;
