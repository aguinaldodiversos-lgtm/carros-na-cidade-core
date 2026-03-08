import { getLogger } from "../logger.js";

export class AppError extends Error {
  constructor(message, statusCode = 400, isOperational = true, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

function handlePostgresError(err) {
  if (err.code === "23505") {
    return new AppError("Registro duplicado.", 409);
  }

  if (err.code === "23503") {
    return new AppError("Relacionamento inválido.", 400);
  }

  if (err.code === "23502") {
    return new AppError("Campo obrigatório não informado.", 400);
  }

  if (err.code === "22P02") {
    return new AppError("Valor inválido informado.", 400);
  }

  return new AppError("Erro no banco de dados.", 500, false);
}

export function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof AppError)) {
    if (error?.code && String(error.code).startsWith("23")) {
      error = handlePostgresError(error);
    } else {
      error = new AppError(
        error?.message || "Internal Server Error",
        error?.statusCode || 500,
        false
      );
    }
  }

  const logger = getLogger({
    requestId: req?.requestId || null,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
  });

  logger.error(
    {
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      details: error.details || null,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    },
    error.message
  );

  if (res.headersSent) {
    return;
  }

  return res.status(error.statusCode).json({
    success: false,
    error: true,
    message: error.message,
    requestId: req?.requestId || null,
    ...(error.details ? { details: error.details } : {}),
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
  });
}
