import { AppError } from "../../shared/middlewares/error.middleware.js";

export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function sanitizeString(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s.length ? s : undefined;
}

export function toBool(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;

  const v = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "y"].includes(v)) return true;
  if (["false", "0", "no", "n"].includes(v)) return false;

  return undefined;
}

export function normalizeSearchFilters(query = {}) {
  return {
    q: sanitizeString(query.q),
    city_id: toNumber(query.city_id),
    brand: sanitizeString(query.brand),
    model: sanitizeString(query.model),
    min_price: toNumber(query.min_price),
    max_price: toNumber(query.max_price),
    year_min: toNumber(query.year_min),
    year_max: toNumber(query.year_max),
    body_type: sanitizeString(query.body_type),
    fuel_type: sanitizeString(query.fuel_type),
    below_fipe: toBool(query.below_fipe),
    page: toNumber(query.page) || 1,
    limit: toNumber(query.limit) || 20,
  };
}

export function normalizeFacetFilters(query = {}) {
  return {
    city_id: toNumber(query.city_id),
    brand: sanitizeString(query.brand),
    model: sanitizeString(query.model),
  };
}

export function validateAdIdentifier(identifier) {
  const normalized = sanitizeString(identifier);

  if (!normalized) {
    throw new AppError("Identificador inválido", 400);
  }

  return normalized;
}

export function validateAdId(id) {
  const normalized = toNumber(id);

  if (!normalized) {
    throw new AppError("ID inválido", 400);
  }

  return normalized;
}

export function validateCreateAdPayload(body = {}) {
  const requiredFields = [
    "title",
    "price",
    "city_id",
    "brand",
    "model",
    "year",
    "mileage",
    "city",
    "state",
  ];

  for (const field of requiredFields) {
    if (!body[field]) {
      throw new AppError(`Campo obrigatório: ${field}`, 400);
    }
  }

  return {
    ...body,
    title: sanitizeString(body.title),
    price: Number(body.price),
    city_id: Number(body.city_id),
    city: sanitizeString(body.city),
    state: sanitizeString(body.state),
    brand: sanitizeString(body.brand),
    model: sanitizeString(body.model),
    year: Number(body.year),
    mileage: Number(body.mileage),
    description: sanitizeString(body.description),
    category: sanitizeString(body.category),
    body_type: sanitizeString(body.body_type),
    fuel_type: sanitizeString(body.fuel_type),
  };
}
