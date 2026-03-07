// src/modules/ads/filters/ads-filter.parser.js

import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { AdsFacetFilterSchema, AdsFilterSchema } from "./ads-filter.schema.js";
import { ADS_SCOPE_CONFIG } from "./ads-filter.constants.js";
import { inferAdsFiltersFromFreeQuery } from "./ads-free-query.parser.js";

function compactObject(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "")
  );
}

function applyScope(scope, parsed) {
  const scopeConfig = ADS_SCOPE_CONFIG[scope];

  if (!scopeConfig) {
    throw new AppError(`Escopo de filtro inválido: ${scope}`, 500);
  }

  return {
    ...parsed,
    ...scopeConfig.force,
  };
}

function validateNormalizedRanges(data) {
  if (
    data.min_price !== undefined &&
    data.max_price !== undefined &&
    data.min_price > data.max_price
  ) {
    throw new AppError("Faixa de preço inválida", 400);
  }

  if (
    data.year_min !== undefined &&
    data.year_max !== undefined &&
    data.year_min > data.year_max
  ) {
    throw new AppError("Faixa de ano inválida", 400);
  }

  return data;
}

export async function parseAdsFilters(raw = {}, scope = "public_global") {
  const candidate = compactObject(raw);
  const parsed = AdsFilterSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new AppError("Filtros de busca inválidos", 400);
  }

  const scoped = applyScope(scope, parsed.data);
  const inferred = await inferAdsFiltersFromFreeQuery(scoped);

  return validateNormalizedRanges(inferred);
}

export async function parseAdsFacetFilters(raw = {}) {
  const candidate = compactObject(raw);
  const parsed = AdsFacetFilterSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new AppError("Filtros de facet inválidos", 400);
  }

  const inferred = await inferAdsFiltersFromFreeQuery(parsed.data);
  return inferred;
}
