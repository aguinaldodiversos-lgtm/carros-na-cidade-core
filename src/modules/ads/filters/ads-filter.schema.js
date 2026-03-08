// src/modules/ads/filters/ads-filter.schema.js
import { z } from "zod";
import { ADS_FILTER_LIMITS } from "./ads-filter.constants.js";

/* =====================================================
   HELPERS
===================================================== */

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "yes", "y", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "nao", "não"].includes(normalized)) return false;

  return undefined;
}

function normalizeNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;

  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
}

function optionalTrimmedString({
  min = 1,
  max = 120,
  toLowerCase = false,
} = {}) {
  return z.preprocess(
    (value) => {
      const normalized = normalizeString(value);
      if (normalized === undefined) return undefined;
      return toLowerCase ? normalized.toLowerCase() : normalized;
    },
    z.string().min(min).max(max).optional()
  );
}

function optionalPositiveInt({ min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  return z.preprocess(
    (value) => normalizeNumber(value),
    z.number().int().min(min).max(max).optional()
  );
}

function optionalPositiveNumber({
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
} = {}) {
  return z.preprocess(
    (value) => normalizeNumber(value),
    z.number().min(min).max(max).optional()
  );
}

function optionalBoolean() {
  return z.preprocess(
    (value) => normalizeBoolean(value),
    z.boolean().optional()
  );
}

/* =====================================================
   LIMITS DEFAULT
===================================================== */

const QUERY_MIN_LENGTH = ADS_FILTER_LIMITS?.QUERY_MIN_LENGTH ?? 2;
const QUERY_MAX_LENGTH = ADS_FILTER_LIMITS?.QUERY_MAX_LENGTH ?? 120;
const BRAND_MAX_LENGTH = ADS_FILTER_LIMITS?.BRAND_MAX_LENGTH ?? 80;
const MODEL_MAX_LENGTH = ADS_FILTER_LIMITS?.MODEL_MAX_LENGTH ?? 80;
const CITY_MAX_LENGTH = ADS_FILTER_LIMITS?.CITY_MAX_LENGTH ?? 120;
const STATE_LENGTH = ADS_FILTER_LIMITS?.STATE_LENGTH ?? 2;
const BODY_TYPE_MAX_LENGTH = ADS_FILTER_LIMITS?.BODY_TYPE_MAX_LENGTH ?? 40;
const FUEL_TYPE_MAX_LENGTH = ADS_FILTER_LIMITS?.FUEL_TYPE_MAX_LENGTH ?? 40;
const TRANSMISSION_MAX_LENGTH =
  ADS_FILTER_LIMITS?.TRANSMISSION_MAX_LENGTH ?? 40;
const SORT_MAX_LENGTH = ADS_FILTER_LIMITS?.SORT_MAX_LENGTH ?? 40;
const PAGE_MAX = ADS_FILTER_LIMITS?.PAGE_MAX ?? 100000;
const LIMIT_MAX = ADS_FILTER_LIMITS?.LIMIT_MAX ?? 100;
const PRICE_MAX = ADS_FILTER_LIMITS?.PRICE_MAX ?? 999999999;
const YEAR_MIN = ADS_FILTER_LIMITS?.YEAR_MIN ?? 1900;
const YEAR_MAX = ADS_FILTER_LIMITS?.YEAR_MAX ?? 2100;
const MILEAGE_MAX = ADS_FILTER_LIMITS?.MILEAGE_MAX ?? 9999999;

/* =====================================================
   SEARCH FILTER SCHEMA
===================================================== */

export const AdsFilterSchema = z
  .object({
    q: optionalTrimmedString({
      min: QUERY_MIN_LENGTH,
      max: QUERY_MAX_LENGTH,
    }),

    brand: optionalTrimmedString({
      min: 1,
      max: BRAND_MAX_LENGTH,
    }),

    model: optionalTrimmedString({
      min: 1,
      max: MODEL_MAX_LENGTH,
    }),

    city: optionalTrimmedString({
      min: 1,
      max: CITY_MAX_LENGTH,
    }),

    city_slug: optionalTrimmedString({
      min: 1,
      max: CITY_MAX_LENGTH,
      toLowerCase: true,
    }),

    state: z.preprocess(
      (value) => {
        const normalized = normalizeString(value);
        return normalized ? normalized.toUpperCase() : undefined;
      },
      z.string().length(STATE_LENGTH).optional()
    ),

    city_id: optionalPositiveInt(),

    min_price: optionalPositiveNumber({
      min: 0,
      max: PRICE_MAX,
    }),

    max_price: optionalPositiveNumber({
      min: 0,
      max: PRICE_MAX,
    }),

    year_min: optionalPositiveInt({
      min: YEAR_MIN,
      max: YEAR_MAX,
    }),

    year_max: optionalPositiveInt({
      min: YEAR_MIN,
      max: YEAR_MAX,
    }),

    mileage_max: optionalPositiveInt({
      min: 0,
      max: MILEAGE_MAX,
    }),

    body_type: optionalTrimmedString({
      min: 1,
      max: BODY_TYPE_MAX_LENGTH,
    }),

    fuel_type: optionalTrimmedString({
      min: 1,
      max: FUEL_TYPE_MAX_LENGTH,
    }),

    transmission: optionalTrimmedString({
      min: 1,
      max: TRANSMISSION_MAX_LENGTH,
    }),

    below_fipe: optionalBoolean(),
    highlight_only: optionalBoolean(),

    sort: optionalTrimmedString({
      min: 1,
      max: SORT_MAX_LENGTH,
      toLowerCase: true,
    }),

    page: optionalPositiveInt({
      min: 1,
      max: PAGE_MAX,
    }),

    limit: optionalPositiveInt({
      min: 1,
      max: LIMIT_MAX,
    }),
  })
  .superRefine((data, ctx) => {
    if (
      data.min_price !== undefined &&
      data.max_price !== undefined &&
      data.min_price > data.max_price
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min_price"],
        message: "min_price não pode ser maior que max_price",
      });
    }

    if (
      data.year_min !== undefined &&
      data.year_max !== undefined &&
      data.year_min > data.year_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["year_min"],
        message: "year_min não pode ser maior que year_max",
      });
    }
  });

/* =====================================================
   AUTOCOMPLETE SCHEMAS
===================================================== */

export const AdsAutocompleteSchema = z.object({
  q: optionalTrimmedString({
    min: QUERY_MIN_LENGTH,
    max: QUERY_MAX_LENGTH,
  }),
  city_slug: optionalTrimmedString({
    min: 1,
    max: CITY_MAX_LENGTH,
    toLowerCase: true,
  }),
  limit: optionalPositiveInt({
    min: 1,
    max: 20,
  }),
});

export const AdsSemanticAutocompleteSchema = z.object({
  q: optionalTrimmedString({
    min: QUERY_MIN_LENGTH,
    max: QUERY_MAX_LENGTH,
  }),
  city_slug: optionalTrimmedString({
    min: 1,
    max: CITY_MAX_LENGTH,
    toLowerCase: true,
  }),
  limit: optionalPositiveInt({
    min: 1,
    max: 20,
  }),
});

/* =====================================================
   PARSERS
===================================================== */

export function parseAdsFilters(input) {
  const parsed = AdsFilterSchema.parse(input);

  return {
    ...parsed,
    page: parsed.page ?? 1,
    limit: parsed.limit ?? 20,
    sort: parsed.sort ?? "relevance",
  };
}

export function parseAdsAutocomplete(input) {
  const parsed = AdsAutocompleteSchema.parse(input);

  return {
    ...parsed,
    limit: parsed.limit ?? 8,
  };
}

export function parseAdsSemanticAutocomplete(input) {
  const parsed = AdsSemanticAutocompleteSchema.parse(input);

  return {
    ...parsed,
    limit: parsed.limit ?? 8,
  };
}
