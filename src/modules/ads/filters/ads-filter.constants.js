// src/modules/ads/filters/ads-filter.constants.js

export const ADS_FILTER_LIMITS = Object.freeze({
  PAGE_MIN: 1,
  PAGE_MAX: 1000,
  LIMIT_MIN: 1,
  LIMIT_MAX: 50,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,

  QUERY_MIN_LENGTH: 2,
  QUERY_MAX_LENGTH: 120,

  BRAND_MAX_LENGTH: 80,
  MODEL_MAX_LENGTH: 80,
  CITY_MAX_LENGTH: 120,
  BODY_TYPE_MAX_LENGTH: 40,
  FUEL_TYPE_MAX_LENGTH: 40,
  TRANSMISSION_MAX_LENGTH: 40,
  SORT_MAX_LENGTH: 40,

  PRICE_MIN: 0,
  PRICE_MAX: 999999999,
  YEAR_MIN: 1900,
  YEAR_MAX: 2100,
  MILEAGE_MIN: 0,
  MILEAGE_MAX: 9999999,

  STATE_LENGTH: 2,
});

export const ADS_DEFAULTS = Object.freeze({
  page: ADS_FILTER_LIMITS.DEFAULT_PAGE,
  limit: ADS_FILTER_LIMITS.DEFAULT_LIMIT,
  sort: "relevance",
});

export const ADS_ALLOWED_SORTS = new Set([
  "relevance",
  "recent",
  "price_asc",
  "price_desc",
  "year_desc",
  "year_asc",
  "mileage_asc",
  "mileage_desc",
  "highlight",
]);

export const ADS_SCOPE_CONFIG = Object.freeze({
  public_global: Object.freeze({ force: Object.freeze({}) }),
  public_city: Object.freeze({ force: Object.freeze({}) }),
  public_city_brand: Object.freeze({ force: Object.freeze({}) }),
  public_city_brand_model: Object.freeze({ force: Object.freeze({}) }),
  public_city_opportunities: Object.freeze({ force: Object.freeze({ below_fipe: true }) }),
  public_city_below_fipe: Object.freeze({ force: Object.freeze({ below_fipe: true }) }),
  panel_inventory: Object.freeze({ force: Object.freeze({}) }),
});

export function isAllowedAdsSort(sort) {
  return ADS_ALLOWED_SORTS.has(String(sort || "").trim().toLowerCase());
}

export function getAdsScopeConfig(scope = "public_global") {
  return ADS_SCOPE_CONFIG[scope] || ADS_SCOPE_CONFIG.public_global;
}
