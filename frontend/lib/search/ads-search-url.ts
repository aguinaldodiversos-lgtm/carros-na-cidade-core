import type { AdsSearchFilters } from "./ads-search";

/** Alinhado a `ADS_FILTER_LIMITS.LIMIT_MAX` no backend (ads-filter.constants.js). */
export const PUBLIC_ADS_SEARCH_LIMIT_MAX = 50;

/** Default de `/comprar` quando `limit` não está na query (máx. aceito pelo backend). */
export const DEFAULT_COMPRAR_CATALOG_LIMIT = PUBLIC_ADS_SEARCH_LIMIT_MAX;

type SearchParamsReader = {
  get(name: string): string | null;
};

function toNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function clampPublicAdsSearchLimit(limit: number): number {
  return Math.min(PUBLIC_ADS_SEARCH_LIMIT_MAX, Math.max(1, Math.trunc(limit)));
}

function parseLimitFromSearchParams(searchParams: SearchParamsReader): number | undefined {
  const raw = searchParams.get("limit");
  if (raw === null || raw === "") return undefined;
  const n = toNumber(raw);
  if (n === undefined) return undefined;
  return clampPublicAdsSearchLimit(n);
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

/**
 * Território canônico na API pública: city_slug (c.slug) > city_id > city+state (legado).
 * Evita AND redundante (slug + id + state) que pode zerar resultados.
 */
export function canonicalTerritoryForApi(
  filters: Pick<AdsSearchFilters, "city_slug" | "city_id" | "city" | "state">
): Partial<Pick<AdsSearchFilters, "city_slug" | "city_id" | "city" | "state">> {
  const slug = filters.city_slug?.trim();
  if (slug) return { city_slug: slug };

  if (filters.city_id != null && Number.isFinite(Number(filters.city_id))) {
    return { city_id: Number(filters.city_id) };
  }

  const out: Partial<Pick<AdsSearchFilters, "city" | "state">> = {};
  if (filters.city) out.city = filters.city;
  if (filters.state) out.state = filters.state;
  return out;
}

const TERRITORY_PARAM_KEYS = ["city_slug", "city_id", "city", "state"] as const;

/** Filtro canônico highlight_only; highlight= é alias legado (não confundir com sort=highlight). */
function mergeHighlightFilterParams(
  highlightOnly: boolean | undefined,
  highlightAlias: boolean | undefined
): boolean | undefined {
  if (highlightOnly === true || highlightAlias === true) return true;
  if (highlightOnly === false || highlightAlias === false) return false;
  return undefined;
}

export function parseAdsSearchFiltersFromSearchParams(
  searchParams: SearchParamsReader
): AdsSearchFilters {
  return {
    q: toStringOrUndefined(searchParams.get("q")),
    brand: toStringOrUndefined(searchParams.get("brand")),
    model: toStringOrUndefined(searchParams.get("model")),
    city_id: toNumber(searchParams.get("city_id")),
    city_slug: toStringOrUndefined(searchParams.get("city_slug")),
    city: toStringOrUndefined(searchParams.get("city")),
    state: toStringOrUndefined(searchParams.get("state")),
    min_price: toNumber(searchParams.get("min_price")) ?? toNumber(searchParams.get("price_min")),
    max_price: toNumber(searchParams.get("max_price")) ?? toNumber(searchParams.get("price_max")),
    year_min: toNumber(searchParams.get("year_min")),
    year_max: toNumber(searchParams.get("year_max")),
    mileage_max: toNumber(searchParams.get("mileage_max")),
    fuel_type: toStringOrUndefined(searchParams.get("fuel_type")),
    transmission: toStringOrUndefined(searchParams.get("transmission")),
    body_type: toStringOrUndefined(searchParams.get("body_type")),
    below_fipe: toBoolean(searchParams.get("below_fipe")),
    highlight_only: mergeHighlightFilterParams(
      toBoolean(searchParams.get("highlight_only")),
      toBoolean(searchParams.get("highlight"))
    ),
    sort: toStringOrUndefined(searchParams.get("sort")) || "relevance",
    page: toNumber(searchParams.get("page")) || 1,
    limit: parseLimitFromSearchParams(searchParams),
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
  const skipTerritory = new Set<string>(TERRITORY_PARAM_KEYS);

  for (const [key, value] of Object.entries(filters)) {
    if (skipTerritory.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "boolean") {
      if (value) params.set(key, "true");
      continue;
    }

    params.set(key, String(value));
  }

  const territory = canonicalTerritoryForApi(filters);
  if (territory.city_slug) params.set("city_slug", territory.city_slug);
  else if (territory.city_id != null) params.set("city_id", String(territory.city_id));
  else {
    if (territory.city) params.set("city", territory.city);
    if (territory.state) params.set("state", territory.state);
  }

  return params.toString();
}
