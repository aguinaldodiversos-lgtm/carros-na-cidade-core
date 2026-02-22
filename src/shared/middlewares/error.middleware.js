// src/shared/middlewares/error.middleware.js

import { logger } from "../logger.js";

export class AppError extends Error {
  constructor(message, statusCode = 400, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
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

  return new AppError("Erro no banco de dados.", 500);
}

export function errorHandler(err, req, res, next) {
  let error = err;

  if (!(error instanceof AppError)) {
    if (error.code && error.code.startsWith("23")) {
      error = handlePostgresError(error);
    } else {
      error = new AppError(
        error.message || "Internal Server Error",
        error.statusCode || 500,
        false
      );
    }
  }

  logger.error({
    message: error.message,
    statusCode: error.statusCode,
    path: req.originalUrl,
    method: req.method,
    stack:
      process.env.NODE_ENV === "development" ? error.stack : undefined
  });

  return res.status(error.statusCode).json({
    error: true,
    message: error.message,
    ...(process.env.NODE_ENV === "development" && {
      stack: error.stack
    })
  });
}
