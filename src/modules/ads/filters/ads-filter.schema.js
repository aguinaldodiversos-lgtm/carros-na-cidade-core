// src/modules/ads/filters/ads-filter.schema.js
import { z } from "zod";
import {
  ADS_FILTER_LIMITS,
  ADS_DEFAULTS,
  isAllowedAdsSort,
  getAdsScopeConfig,
} from "./ads-filter.constants.js";

/* =========================================================
   Helpers (evita ZodEffects + .min/.max em cima)
========================================================= */

function firstOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

function emptyToUndef(value) {
  const v = firstOf(value);
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s.length ? s : undefined;
}

const optionalTrimmedString = (min, max) =>
  z.preprocess(emptyToUndef, z.string().trim().min(min).max(max)).optional();

const optionalTrimmedStringMax = (max) =>
  z.preprocess(emptyToUndef, z.string().trim().max(max)).optional();

const intParam = (min, max) =>
  z.preprocess((value) => {
    const v = firstOf(value);
    if (v === undefined || v === null) return undefined;
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v !== "string") return v;

    const s = v.trim();
    if (!s) return undefined;

    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : v;
  }, z.number().int().min(min).max(max));

const numberParam = (min, max) =>
  z.preprocess((value) => {
    const v = firstOf(value);
    if (v === undefined || v === null) return undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "string") return v;

    const s = v.trim();
    if (!s) return undefined;

    // aceita "123,45" e "123.45"
    const normalized = s.replace(",", ".");
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) ? n : v;
  }, z.number().min(min).max(max));

const boolParam = () =>
  z.preprocess((value) => {
    const v = firstOf(value);
    if (v === undefined || v === null) return undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
    if (typeof v !== "string") return v;

    const s = v.trim().toLowerCase();
    if (!s) return undefined;

    if (["true", "1", "yes", "y", "on", "sim"].includes(s)) return true;
    if (["false", "0", "no", "n", "off", "nao", "não"].includes(s))
      return false;

    return v; // força falha de validação (z.boolean)
  }, z.boolean());

const sortParam = () =>
  z
    .preprocess(
      emptyToUndef,
      z
        .string()
        .trim()
        .max(ADS_FILTER_LIMITS.SORT_MAX_LENGTH)
        .transform((v) => v.toLowerCase())
        .refine((v) => isAllowedAdsSort(v), { message: "Sort inválido." })
    )
    .default(ADS_DEFAULTS.sort);

/* =========================================================
   Schema principal (query)
========================================================= */

export const adsFilterQuerySchema = z
  .object({
    // paginação
    page: intParam(ADS_FILTER_LIMITS.PAGE_MIN, ADS_FILTER_LIMITS.PAGE_MAX).default(
      ADS_DEFAULTS.page
    ),
    limit: intParam(
      ADS_FILTER_LIMITS.LIMIT_MIN,
      ADS_FILTER_LIMITS.LIMIT_MAX
    ).default(ADS_DEFAULTS.limit),
    sort: sortParam(),

    // busca livre
    q: optionalTrimmedString(
      ADS_FILTER_LIMITS.QUERY_MIN_LENGTH,
      ADS_FILTER_LIMITS.QUERY_MAX_LENGTH
    ),

    // território
    city: optionalTrimmedStringMax(ADS_FILTER_LIMITS.CITY_MAX_LENGTH),
    state: z
      .preprocess(
        emptyToUndef,
        z
          .string()
          .trim()
          .length(ADS_FILTER_LIMITS.STATE_LENGTH, { message: "UF inválida." })
          .transform((v) => v.toUpperCase())
      )
      .optional(),

    // veículo
    brand: optionalTrimmedStringMax(ADS_FILTER_LIMITS.BRAND_MAX_LENGTH),
    model: optionalTrimmedStringMax(ADS_FILTER_LIMITS.MODEL_MAX_LENGTH),
    body_type: optionalTrimmedStringMax(ADS_FILTER_LIMITS.BODY_TYPE_MAX_LENGTH),
    fuel_type: optionalTrimmedStringMax(ADS_FILTER_LIMITS.FUEL_TYPE_MAX_LENGTH),
    transmission: optionalTrimmedStringMax(ADS_FILTER_LIMITS.TRANSMISSION_MAX_LENGTH),

    // ranges
    year_min: intParam(ADS_FILTER_LIMITS.YEAR_MIN, ADS_FILTER_LIMITS.YEAR_MAX).optional(),
    year_max: intParam(ADS_FILTER_LIMITS.YEAR_MIN, ADS_FILTER_LIMITS.YEAR_MAX).optional(),

    price_min: numberParam(ADS_FILTER_LIMITS.PRICE_MIN, ADS_FILTER_LIMITS.PRICE_MAX).optional(),
    price_max: numberParam(ADS_FILTER_LIMITS.PRICE_MIN, ADS_FILTER_LIMITS.PRICE_MAX).optional(),

    mileage_min: intParam(
      ADS_FILTER_LIMITS.MILEAGE_MIN,
      ADS_FILTER_LIMITS.MILEAGE_MAX
    ).optional(),
    mileage_max: intParam(
      ADS_FILTER_LIMITS.MILEAGE_MIN,
      ADS_FILTER_LIMITS.MILEAGE_MAX
    ).optional(),

    // flags
    below_fipe: boolParam().optional(),
    highlight: boolParam().optional(),
  })
  .passthrough() // tolera parâmetros extras no querystring (não quebra)
  .superRefine((d, ctx) => {
    if (d.year_min !== undefined && d.year_max !== undefined && d.year_min > d.year_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["year_min"],
        message: "year_min não pode ser maior que year_max.",
      });
    }

    if (d.price_min !== undefined && d.price_max !== undefined && d.price_min > d.price_max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price_min"],
        message: "price_min não pode ser maior que price_max.",
      });
    }

    if (
      d.mileage_min !== undefined &&
      d.mileage_max !== undefined &&
      d.mileage_min > d.mileage_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mileage_min"],
        message: "mileage_min não pode ser maior que mileage_max.",
      });
    }
  });

/* =========================================================
   Facet schema (compat com parser antigo)
   - subset seguro do schema principal
   - passthrough para não quebrar se vier page/limit/sort etc.
========================================================= */

export const AdsFacetFilterSchema = z
  .object({
    q: adsFilterQuerySchema.shape.q,
    city: adsFilterQuerySchema.shape.city,
    state: adsFilterQuerySchema.shape.state,
    brand: adsFilterQuerySchema.shape.brand,
    model: adsFilterQuerySchema.shape.model,
    body_type: adsFilterQuerySchema.shape.body_type,
    fuel_type: adsFilterQuerySchema.shape.fuel_type,
    transmission: adsFilterQuerySchema.shape.transmission,
    year_min: adsFilterQuerySchema.shape.year_min,
    year_max: adsFilterQuerySchema.shape.year_max,
    price_min: adsFilterQuerySchema.shape.price_min,
    price_max: adsFilterQuerySchema.shape.price_max,
    mileage_min: adsFilterQuerySchema.shape.mileage_min,
    mileage_max: adsFilterQuerySchema.shape.mileage_max,
    below_fipe: adsFilterQuerySchema.shape.below_fipe,
    highlight: adsFilterQuerySchema.shape.highlight,
  })
  .passthrough();

/* =========================================================
   Compat exports (nomes antigos/novos usados em outros arquivos)
========================================================= */

export const AdsFilterQuerySchema = adsFilterQuerySchema; // compat
export const AdsFilterSchema = adsFilterQuerySchema; // compat (ads-filter.parser.js)
export const adsFilterSchema = adsFilterQuerySchema; // compat

/**
 * Parse + aplica "scope force"
 * - scope vem do código (ex: rota territorial), não do querystring.
 */
export function parseAdsFilterQuery(rawQuery, scope = "public_global") {
  const parsed = adsFilterQuerySchema.parse(rawQuery);
  const forced = getAdsScopeConfig(scope)?.force || {};
  return { ...parsed, ...forced };
}

export default {
  adsFilterQuerySchema,
  AdsFilterQuerySchema,
  AdsFilterSchema,
  AdsFacetFilterSchema,
  parseAdsFilterQuery,
};
