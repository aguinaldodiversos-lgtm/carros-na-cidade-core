import { getLogger } from "../logger.js";
// Import de `modules/` dentro de `shared/` é inversão de camada, aceita aqui
// de propósito: `ads.upload.constants` é a FONTE ÚNICA dos limites (multer,
// Zod, routes e r2.service leem dela) e o próprio arquivo documenta que
// divergir desses números já causou bug. Duplicar os valores na mensagem de
// erro seria pior que a inversão. Sem ciclo: o módulo não importa nada.
import {
  VEHICLE_IMAGE_MAX_FILES,
  VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
} from "../../modules/ads/ads.upload.constants.js";

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

/**
 * Mensagem neutra por faixa de status, para erro não mapeado.
 *
 * Em português porque é texto de usuário final — o público do portal é BR.
 * Genérica de propósito: o detalhe fica no log, correlacionável por requestId.
 */
/**
 * Erros do multer viram mensagem de usuário em português.
 *
 * `MulterError` não carrega `statusCode` e sua `.message` é em inglês
 * ("File too large", "Too many files"). Antes da trava de exposição isso
 * chegava cru ao cliente: feio, mas informativo. Sem este mapa, passaria a
 * cair no genérico "Erro interno" — pior, porque quem mandou uma foto de 20 MB
 * ficaria sem saber o que fazer.
 *
 * Retorna `null` quando não é erro de multer.
 */
function mapMulterError(err) {
  if (err?.name !== "MulterError") return null;

  const mb = Math.round(VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES / (1024 * 1024));
  const byCode = {
    LIMIT_FILE_SIZE: {
      statusCode: 413,
      message: `Imagem grande demais. O limite é ${mb} MB por foto.`,
    },
    LIMIT_FILE_COUNT: {
      statusCode: 413,
      message: `Muitas imagens de uma vez. Envie no máximo ${VEHICLE_IMAGE_MAX_FILES}.`,
    },
    LIMIT_UNEXPECTED_FILE: {
      statusCode: 400,
      message: "Campo de arquivo inesperado no envio.",
    },
  };

  return byCode[err.code] || { statusCode: 400, message: "Falha ao receber o arquivo enviado." };
}

function genericMessageForStatus(statusCode) {
  if (statusCode === 413) return "Arquivo grande demais.";
  if (statusCode === 415) return "Formato de arquivo não suportado.";
  if (statusCode === 429) return "Muitas requisições. Tente novamente em instantes.";
  if (statusCode >= 400 && statusCode < 500) return "Requisição inválida.";
  return "Erro interno. Tente novamente em instantes.";
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

      // A mensagem de um erro NÃO MAPEADO não pode virar corpo de resposta.
      //
      // Antes: `new AppError(raw?.message || "Internal Server Error", ...)`.
      // Isso copiava a string interna de qualquer biblioteca direto para o
      // JSON devolvido ao cliente. Em 2026-07-29 o usuário final viu, na tela
      // do wizard de anúncio, o texto do libvips:
      //   "source: bad seek to 1495082 ... heif: Error while loading plugin"
      // Não é só feio: expõe caminho de código, offsets e versão de
      // dependência para qualquer visitante.
      //
      // Quem QUER expor mensagem marca o erro com `expose = true` (ver
      // `UnsupportedImageFormatError` em image-normalizer.js) — decisão
      // explícita de quem escreveu o erro, nunca vazamento por omissão.
      // O texto completo continua no log acima, com requestId para correlação.
      const multer = mapMulterError(raw);
      if (multer) {
        error = new AppError(multer.message, multer.statusCode, true);
      } else {
        const statusCode = raw?.statusCode || 500;
        const canExpose = raw?.expose === true && typeof raw?.message === "string" && raw.message;
        error = new AppError(
          canExpose ? raw.message : genericMessageForStatus(statusCode),
          statusCode,
          false
        );
      }
    }
  }

  const logger = getLogger({
    requestId: req?.requestId || null,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
  });

  // 404 público (rota não encontrada) é evento de tráfego, não erro de
  // aplicação. Em ataques de enumeração, cada 404 gerava log level 50 com
  // stack — ruído operacional pesado. Rebaixa para `warn` (40) e omite stack.
  //
  // 5xx e 4xx aplicacionais (validação, conflito, etc.) seguem em error/warn
  // normal — esse fluxo é o que importa pra alarmes.
  if (error.statusCode === 404 && error.isOperational) {
    logger.warn(
      {
        requestId: req?.requestId || null,
        statusCode: 404,
        method: req?.method || null,
        path: req?.originalUrl || req?.url || null,
      },
      "[http] 404: rota inexistente"
    );
  } else {
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
  }

  if (res.headersSent) {
    return;
  }

  // Resposta 404 enxuta — corpo mínimo + Cache-Control curto. Evita pagar
  // bandwidth por requestId/details em 404 de bot.
  if (error.statusCode === 404 && error.isOperational) {
    res.set("Cache-Control", "public, max-age=60");
    return res.status(404).json({ success: false, error: "not_found" });
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
