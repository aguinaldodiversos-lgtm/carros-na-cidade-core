export const ADS_FILTER_LIMITS = {
  PAGE_MIN: 1,
  PAGE_MAX: 1000,
  LIMIT_MIN: 1,
  LIMIT_MAX: 50,
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  QUERY_MIN_LENGTH: 2,
  QUERY_MAX_LENGTH: 120,
};

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

export const ADS_SCOPE_CONFIG = {
  public_global: {
    force: {},
  },
  public_city: {
    force: {},
  },
  public_city_brand: {
    force: {},
  },
  public_city_brand_model: {
    force: {},
  },
  public_city_opportunities: {
    force: {
      below_fipe: true,
    },
  },
  public_city_below_fipe: {
    force: {
      below_fipe: true,
    },
  },
  panel_inventory: {
    force: {},
  },
};
