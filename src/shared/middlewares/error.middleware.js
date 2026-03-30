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

function pgDetails(err) {
  return {
    code: err?.code ?? null,
    detail: err?.detail ?? null,
    constraint: err?.constraint ?? null,
    table: err?.table ?? null,
    column: err?.column ?? null,
    schema: err?.schema ?? null,
    hint: err?.hint ?? null,
    severity: err?.severity ?? null,
    routine: err?.routine ?? null,
    position: err?.position ?? null,
  };
}

const MAX_WHERE_SNIPPET = 480;

function serializeUnknownErr(err) {
  if (!err || typeof err !== "object") {
    return { message: String(err) };
  }
  const o = {
    message: typeof err.message === "string" ? err.message : String(err),
    name: typeof err.name === "string" ? err.name : null,
    stack:
      process.env.NODE_ENV === "development" && typeof err.stack === "string" ? err.stack : null,
  };
  if (err.code != null) o.code = err.code;
  if (err.constraint != null) o.constraint = err.constraint;
  if (err.detail != null) o.detail = err.detail;
  if (err.column != null) o.column = err.column;
  if (err.table != null) o.table = err.table;
  if (err.schema != null) o.schema = err.schema;
  if (err.hint != null) o.hint = err.hint;
  if (typeof err.where === "string" && err.where.length) {
    o.where =
      err.where.length > MAX_WHERE_SNIPPET
        ? `${err.where.slice(0, MAX_WHERE_SNIPPET)}…`
        : err.where;
  }
  return o;
}

function handlePostgresError(err) {
  const details = pgDetails(err);
  const detailText = typeof err?.detail === "string" && err.detail.trim() ? err.detail.trim() : "";

  if (err.code === "23505") {
    return new AppError("Registro duplicado.", 409, true, details);
  }

  if (err.code === "23503") {
    const msg = detailText
      ? `Relacionamento inválido: ${detailText}`
      : "Relacionamento inválido (chave estrangeira).";
    return new AppError(msg, 400, true, details);
  }

  if (err.code === "23502") {
    const col = err?.column ? ` (${String(err.column)})` : "";
    return new AppError(`Campo obrigatório não informado${col}.`, 400, true, details);
  }

  if (err.code === "23514") {
    const msg =
      typeof err?.message === "string" && err.message.trim()
        ? err.message.trim()
        : "Restrição de validação do banco não atendida.";
    return new AppError(msg, 400, true, details);
  }

  if (err.code === "22P02") {
    return new AppError("Valor inválido informado.", 400, true, details);
  }

  if (typeof err?.message === "string" && err.message.trim()) {
    return new AppError(err.message.trim(), 500, false, details);
  }

  return new AppError("Erro no banco de dados.", 500, false, details);
}

export function errorHandler(err, req, res, _next) {
  let error = err;

  if (!(error instanceof AppError)) {
    if (error?.code && String(error.code).startsWith("23")) {
      const logger = getLogger({
        requestId: req?.requestId || null,
        method: req?.method || null,
        path: req?.originalUrl || req?.url || null,
      });
      logger.error(
        {
          ...pgDetails(error),
          originalMessage: error?.message || null,
          rawVehicleFields: req?.body
            ? {
                body_type: req.body.body_type ?? null,
                fuel_type: req.body.fuel_type ?? null,
                transmission: req.body.transmission ?? null,
              }
            : null,
          requestId: req?.requestId || null,
          userId: req?.user?.id != null ? String(req.user.id) : null,
        },
        "[postgres] falha antes do mapeamento"
      );
      error = handlePostgresError(error);
    } else if (error?.code && String(error.code).startsWith("42")) {
      const logger = getLogger({
        requestId: req?.requestId || null,
        method: req?.method || null,
        path: req?.originalUrl || req?.url || null,
      });
      logger.error(
        {
          ...pgDetails(error),
          originalMessage: error?.message || null,
          requestId: req?.requestId || null,
          userId: req?.user?.id != null ? String(req.user.id) : null,
        },
        "[postgres] erro de schema/objeto"
      );
      error = new AppError(
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Erro de schema no banco de dados.",
        500,
        false,
        pgDetails(error)
      );
    } else {
      const raw = err;
      const logger = getLogger({
        requestId: req?.requestId || null,
        method: req?.method || null,
        path: req?.originalUrl || req?.url || null,
      });
      logger.error(
        {
          requestId: req?.requestId || null,
          userId: req?.user?.id != null ? String(req.user.id) : null,
          err: serializeUnknownErr(raw),
        },
        "[errorHandler] erro não mapeado antes do AppError"
      );
      error = new AppError(raw?.message || "Internal Server Error", raw?.statusCode || 500, false);
    }
  }

  const logger = getLogger({
    requestId: req?.requestId || null,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
  });

  logger.error(
    {
      requestId: req?.requestId || null,
      userId: req?.user?.id != null ? String(req.user.id) : null,
      statusCode: error.statusCode,
      isOperational: error.isOperational,
      details: error.details || null,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    },
    `[http] ${error.statusCode >= 500 ? "5xx" : "erro"}: ${error.message}`
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
