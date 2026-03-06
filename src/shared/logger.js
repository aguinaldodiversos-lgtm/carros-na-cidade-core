import pino from "pino";

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? "info" : "debug");
const SERVICE_NAME = process.env.SERVICE_NAME || "carros-na-cidade-core";

function buildTransport() {
  if (IS_PRODUCTION) {
    return undefined;
  }

  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      singleLine: false,
    },
  };
}

function errSerializer(error) {
  if (!error) return error;

  return {
    type: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    statusCode: error.statusCode,
  };
}

function extractRequestContext(req) {
  if (!req || typeof req !== "object") {
    return null;
  }

  const looksLikeExpressRequest =
    "headers" in req &&
    ("originalUrl" in req || "url" in req) &&
    "method" in req;

  if (!looksLikeExpressRequest) {
    return null;
  }

  return {
    requestId: req.requestId || req.headers?.["x-request-id"] || undefined,
    method: req.method || undefined,
    path: req.originalUrl || req.url || undefined,
    ip: req.ip || undefined,
    userAgent: req.headers?.["user-agent"] || undefined,
  };
}

function normalizeLoggerContext(input = "app") {
  if (!input) {
    return { scope: "app" };
  }

  if (typeof input === "string") {
    return { scope: input };
  }

  const requestContext = extractRequestContext(input);
  if (requestContext) {
    return {
      scope: "http",
      ...requestContext,
    };
  }

  if (typeof input === "object" && !Array.isArray(input)) {
    return input;
  }

  return { scope: "app" };
}

const logger = pino({
  level: LOG_LEVEL,

  base: {
    service: SERVICE_NAME,
    env: NODE_ENV,
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    level(label) {
      return { level: label };
    },
  },

  serializers: {
    err: errSerializer,
    error: errSerializer,
  },

  transport: buildTransport(),
});

export function getLogger(context = "app") {
  const bindings = normalizeLoggerContext(context);
  return logger.child(bindings);
}

export { logger };
export default logger;
