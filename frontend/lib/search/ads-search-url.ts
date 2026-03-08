// frontend/lib/search/ads-search-url.ts

import type { AdsSearchFilters } from "./ads-search";

function toNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toBoolean(value: string | null): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "y", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "nao", "não"].includes(normalized)) return false;

  return undefined;
}

function toStringOrUndefined(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseAdsSearchFiltersFromSearchParams(
  searchParams: URLSearchParams | ReadonlyURLSearchParams
): AdsSearchFilters {
  return {
    q: toStringOrUndefined(searchParams.get("q")),
    brand: toStringOrUndefined(searchParams.get("brand")),
    model: toStringOrUndefined(searchParams.get("model")),
    city_id: toNumber(searchParams.get("city_id")),
    city_slug: toStringOrUndefined(searchParams.get("city_slug")),
    city: toStringOrUndefined(searchParams.get("city")),
    state: toStringOrUndefined(searchParams.get("state")),
    min_price: toNumber(searchParams.get("min_price")),
    max_price: toNumber(searchParams.get("max_price")),
    year_min: toNumber(searchParams.get("year_min")),
    year_max: toNumber(searchParams.get("year_max")),
    mileage_max: toNumber(searchParams.get("mileage_max")),
    fuel_type: toStringOrUndefined(searchParams.get("fuel_type")),
    transmission: toStringOrUndefined(searchParams.get("transmission")),
    body_type: toStringOrUndefined(searchParams.get("body_type")),
    below_fipe: toBoolean(searchParams.get("below_fipe")),
    highlight_only: toBoolean(searchParams.get("highlight_only")),
    sort: toStringOrUndefined(searchParams.get("sort")) || "relevance",
    page: toNumber(searchParams.get("page")) || 1,
    limit: toNumber(searchParams.get("limit")) || 20,
  };
}

export function mergeSearchFilters(
  current: AdsSearchFilters,
  patch: Partial<AdsSearchFilters>
): AdsSearchFilters {
  const merged: AdsSearchFilters = {
    ...current,
    ...patch,
  };

  Object.keys(merged).forEach((key) => {
    const typedKey = key as keyof AdsSearchFilters;
    if (merged[typedKey] === undefined || merged[typedKey] === null || merged[typedKey] === "") {
      delete merged[typedKey];
    }
  });

  return merged;
}

export function buildSearchQueryString(filters: AdsSearchFilters): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "boolean") {
      if (value) params.set(key, "true");
      continue;
    }

    params.set(key, String(value));
  }

  return params.toString();
}
