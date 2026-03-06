import { getLogger } from "../logger.js";

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

export class AppError extends Error {
  constructor(message, statusCode = 400, isOperational = true, details = null) {
    super(message);

    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace?.(this, this.constructor);
  }
}

function isPostgresConstraintError(error) {
  return Boolean(error?.code && String(error.code).startsWith("23"));
}

function handlePostgresError(error) {
  switch (error.code) {
    case "23505":
      return new AppError("Registro duplicado.", 409, true, {
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
      });

    case "23503":
      return new AppError("Relacionamento inválido.", 400, true, {
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
      });

    case "23502":
      return new AppError("Campo obrigatório não informado.", 400, true, {
        code: error.code,
        column: error.column,
        detail: error.detail,
      });

    case "22P02":
      return new AppError("Valor inválido informado.", 400, true, {
        code: error.code,
        detail: error.detail,
      });

    default:
      return new AppError("Erro no banco de dados.", 500, false, {
        code: error.code,
        constraint: error.constraint,
        detail: error.detail,
      });
  }
}

function handleBodyParserError(error) {
  if (error?.type === "entity.too.large") {
    return new AppError("Payload muito grande.", 413, true);
  }

  if (error instanceof SyntaxError && "body" in error) {
    return new AppError("JSON inválido.", 400, true);
  }

  return null;
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  const bodyParserError = handleBodyParserError(error);
  if (bodyParserError) {
    return bodyParserError;
  }

  if (isPostgresConstraintError(error) || error?.code === "22P02") {
    return handlePostgresError(error);
  }

  if (error?.name === "UnauthorizedError") {
    return new AppError("Não autorizado.", 401, true);
  }

  return new AppError(
    IS_PRODUCTION ? "Internal Server Error" : error?.message || "Internal Server Error",
    Number(error?.statusCode || error?.status || 500),
    false
  );
}

export function errorHandler(err, req, res, next) {
  const error = normalizeError(err);
  const logger = getLogger(req);

  const statusCode =
    Number.isInteger(error.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  const isServerError = statusCode >= 500;

  const logPayload = {
    message: error.message,
    errorName: error.name,
    statusCode,
    isOperational: error.isOperational,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip,
    details: error.details || undefined,
    stack: !IS_PRODUCTION ? error.stack : undefined,
  };

  if (isServerError) {
    logger.error(logPayload, "[error.middleware] Request failed with server error");
  } else {
    logger.warn(logPayload, "[error.middleware] Request failed with client error");
  }

  if (res.headersSent) {
    return next(error);
  }

  const response = {
    error: true,
    message: error.message,
    requestId: req.requestId || null,
  };

  if (!IS_PRODUCTION && error.details) {
    response.details = error.details;
  }

  if (!IS_PRODUCTION && error.stack) {
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
}
