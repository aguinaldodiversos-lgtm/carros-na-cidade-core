import { getLogger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

const SAFE_PAYLOAD_KEYS = [
  "title",
  "brand",
  "model",
  "year",
  "city_id",
  "city",
  "state",
  "price",
  "mileage",
  "body_type",
  "fuel_type",
  "transmission",
  "category",
  "below_fipe",
  "plan",
  "status",
];

const MAX_DESC = 220;

/**
 * Payload seguro para log (sem textos enormes; sem campos sensíveis explícitos).
 */
export function sanitizeAdPayloadForLog(payload) {
  if (payload == null || typeof payload !== "object") {
    return {};
  }

  const out = {};
  for (const key of SAFE_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] != null) {
      out[key] = payload[key];
    }
  }

  if (typeof payload.description === "string" && payload.description.length) {
    const d = payload.description;
    out.description =
      d.length > MAX_DESC ? `${d.slice(0, MAX_DESC)}…` : d;
  }

  if (payload.advertiser_id != null) {
    out.advertiser_id = payload.advertiser_id;
  }

  if (payload.ad_id != null) {
    out.ad_id = payload.ad_id;
  }

  return out;
}

const MAX_WHERE_SNIPPET = 480;

/**
 * Erro serializado para Pino (stack + Postgres / AppError).
 */
function serializeErr(err) {
  if (!err || typeof err !== "object") {
    return { message: String(err) };
  }

  const o = {
    message: typeof err.message === "string" ? err.message : String(err),
    stack: typeof err.stack === "string" ? err.stack : null,
  };

  if (err.code != null) o.code = err.code;
  if (err.constraint != null) o.constraint = err.constraint;
  if (err.detail != null) o.detail = err.detail;
  if (err.column != null) o.column = err.column;
  if (err.table != null) o.table = err.table;
  if (err.schema != null) o.schema = err.schema;
  if (err.hint != null) o.hint = err.hint;
  if (err.severity != null) o.severity = err.severity;
  if (err.routine != null) o.routine = err.routine;
  if (err.position != null) o.position = err.position;
  if (typeof err.where === "string" && err.where.length) {
    o.where =
      err.where.length > MAX_WHERE_SNIPPET
        ? `${err.where.slice(0, MAX_WHERE_SNIPPET)}…`
        : err.where;
  }

  if (err.statusCode != null) o.statusCode = err.statusCode;
  if (err.isOperational != null) o.isOperational = err.isOperational;
  if (err.details != null && typeof err.details === "object") {
    o.details = err.details;
  }

  return o;
}

/**
 * Log estruturado de falha no fluxo de criação/publicação de anúncio.
 * Não altera a resposta HTTP — apenas diagnóstico.
 */
export function logAdsPublishFailure(err, context = {}) {
  const {
    stage = "unknown",
    requestId = null,
    userId = null,
    advertiserId = null,
    cityId = null,
    adId = null,
    payload = null,
  } = context;

  const logger = getLogger({
    requestId: requestId || undefined,
    flow: "ads.publish",
    stage,
  });

  logger.error(
    {
      ...buildDomainFields({
        action: `ads.publish.${stage}`,
        result: "error",
        requestId,
        userId,
      }),
      stage,
      advertiserId: advertiserId != null ? advertiserId : null,
      cityId: cityId != null ? cityId : null,
      adId: adId != null ? adId : null,
      payload: payload && typeof payload === "object" ? payload : null,
      err: serializeErr(err),
    },
    `[ads.publish] falha na etapa: ${stage}`
  );
}
