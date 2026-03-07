import { z } from "zod";
import {
  ADS_ALLOWED_SORTS,
  ADS_FILTER_LIMITS,
} from "./ads-filter.constants.js";

const positiveInt = z.coerce.number().int().positive();
const nonNegativeNumber = z.coerce.number().nonnegative();
const trimmedString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim());

const booleanLike = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();

    if (["true", "1", "yes", "y", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "nao", "não"].includes(normalized)) return false;

    return undefined;
  })
  .optional();

export const AdsFilterSchema = z.object({
  q: trimmedString
    .min(ADS_FILTER_LIMITS.QUERY_MIN_LENGTH)
    .max(ADS_FILTER_LIMITS.QUERY_MAX_LENGTH)
    .optional(),
  city_id: positiveInt.optional(),
  city_slug: trimmedString.min(1).max(120).optional(),
  city: trimmedString.min(1).max(120).optional(),
  state: trimmedString.min(2).max(2).optional(),
  brand: trimmedString.min(1).max(120).optional(),
  model: trimmedString.min(1).max(120).optional(),
  min_price: nonNegativeNumber.optional(),
  max_price: nonNegativeNumber.optional(),
  year_min: z.coerce.number().int().min(1900).max(2100).optional(),
  year_max: z.coerce.number().int().min(1900).max(2100).optional(),
  mileage_max: nonNegativeNumber.optional(),
  fuel_type: trimmedString.min(1).max(80).optional(),
  transmission: trimmedString.min(1).max(80).optional(),
  body_type: trimmedString.min(1).max(80).optional(),
  below_fipe: booleanLike,
  highlight_only: booleanLike,
  page: z.coerce
    .number()
    .int()
    .min(ADS_FILTER_LIMITS.PAGE_MIN)
    .max(ADS_FILTER_LIMITS.PAGE_MAX)
    .default(ADS_FILTER_LIMITS.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(ADS_FILTER_LIMITS.LIMIT_MIN)
    .max(ADS_FILTER_LIMITS.LIMIT_MAX)
    .default(ADS_FILTER_LIMITS.DEFAULT_LIMIT),
  sort: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .refine((value) => ADS_ALLOWED_SORTS.has(value), {
      message: "Invalid sort option",
    })
    .default("relevance"),
});

export const AdsFacetFilterSchema = z.object({
  city_id: positiveInt.optional(),
  city_slug: trimmedString.min(1).max(120).optional(),
  brand: trimmedString.min(1).max(120).optional(),
  model: trimmedString.min(1).max(120).optional(),
  below_fipe: booleanLike,
  fuel_type: trimmedString.min(1).max(80).optional(),
  transmission: trimmedString.min(1).max(80).optional(),
  body_type: trimmedString.min(1).max(80).optional(),
});
