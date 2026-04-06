import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import { canonicalTerritoryForApi, clampPublicAdsSearchLimit } from "@/lib/search/ads-search-url";
import { collectVehicleImageCandidates } from "@/lib/vehicle/detail-utils";

export interface AdsSearchFilters {
  q?: string;
  brand?: string;
  model?: string;
  city_id?: number;
  city_slug?: string;
  city?: string;
  state?: string;
  /** Anúncios do mesmo anunciante (ex.: loja). */
  advertiser_id?: number;
  min_price?: number;
  max_price?: number;
  year_min?: number;
  year_max?: number;
  mileage_max?: number;
  fuel_type?: string;
  transmission?: string;
  body_type?: string;
  below_fipe?: boolean;
  /** Filtro: somente anúncios em destaque. Alias de query `highlight=true` é aceito (compat). */
  highlight_only?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface AdItem {
  id: number;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  version?: string;
  city?: string;
  state?: string;
  year?: number;
  year_model?: string | null;
  mileage?: number;
  price?: number;
  fuel_type?: string | null;
  transmission?: string | null;
  body_type?: string | null;
  below_fipe?: boolean;
  highlight_until?: string | null;
  plan?: string | null;
  created_at?: string;
  updated_at?: string;
  image_url?: string | null;
  image?: string | null;
  cover_image_url?: string | null;
  cover_image?: string | null;
  /** Chave R2 quando `image_url` ainda não é URL pública. */
  storage_key?: string | null;
  images?: string[] | null;
  photos?: unknown;
  gallery?: unknown;
  seller_type?: string | null;
  seller_name?: string | null;
  dealer_name?: string | null;
  dealership_name?: string | null;
  dealership_id?: number | null;
}

export interface AdsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdsSearchResponse {
  success: boolean;
  ok?: boolean;
  filters?: Record<string, unknown>;
  data: AdItem[];
  pagination: AdsPagination;
  error?: string | null;
}

export interface AdsFacetsResponse {
  success: boolean;
  facets: {
    brands: Array<{ brand: string; total: number }>;
    models: Array<{ brand: string; model: string; total: number }>;
    fuelTypes: Array<{ fuel_type: string; total: number }>;
    bodyTypes: Array<{ body_type: string; total: number }>;
  };
}

const EMPTY_PAGINATION: AdsPagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

const EMPTY_FACETS: AdsFacetsResponse["facets"] = {
  brands: [],
  models: [],
  fuelTypes: [],
  bodyTypes: [],
};

/**
 * Mesma prioridade que login/dashboard (`getBackendApiBaseUrl`), para a listagem pública
 * não cair em localhost quando só AUTH_API_BASE_URL / BACKEND_API_URL estão definidos no Render.
 */
function getApiBaseUrl(): string {
  const base = getBackendApiBaseUrl();
  if (base) return base;
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

function appendIfPresent(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  params.set(key, String(value));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(
      value
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(\D|$))/g, "")
        .replace(",", ".")
    );

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toOptionalNumber(value: unknown) {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNullableText(value: unknown) {
  const parsed = toText(value, "");
  return parsed || null;
}

function normalizeAdItem(raw: unknown, index: number): AdItem | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;

  const images = collectVehicleImageCandidates(
    item.image_url,
    item.image,
    item.cover_image,
    item.storage_key ? { storage_key: item.storage_key } : null,
    item.images,
    item.gallery,
    item.photos,
    item.thumbnail,
    item.photo,
    item.thumb
  );
  const imagesList = images.length > 0 ? images : null;

  const imageUrl = imagesList?.[0] ?? null;

  const id =
    toOptionalNumber(item.id) ??
    Math.abs(
      String(toText(item.slug) || toText(item.title) || `ad-${index + 1}`)
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    );

  return {
    id,
    slug: toText(item.slug) || undefined,
    title: toText(item.title) || undefined,
    brand: toText(item.brand) || undefined,
    model: toText(item.model) || undefined,
    version: toText(item.version) || undefined,
    city: toText(item.city) || undefined,
    state: toText(item.state) || undefined,
    year: toOptionalNumber(item.year),
    year_model: toNullableText(item.year_model ?? item.yearLabel),
    mileage: toOptionalNumber(item.mileage ?? item.km),
    price: toOptionalNumber(item.price),
    fuel_type: toNullableText(item.fuel_type),
    transmission: toNullableText(item.transmission),
    body_type: toNullableText(item.body_type),
    below_fipe: item.below_fipe === true,
    highlight_until: toNullableText(item.highlight_until),
    plan: toNullableText(item.plan),
    created_at: toText(item.created_at) || undefined,
    updated_at: toText(item.updated_at) || undefined,
    image_url: imageUrl,
    image: toNullableText(item.image),
    cover_image_url: toNullableText(item.cover_image_url),
    cover_image: toNullableText(item.cover_image),
    storage_key: toNullableText(item.storage_key),
    images: imagesList,
    photos: item.photos,
    gallery: item.gallery,
    seller_type: toNullableText(item.seller_type),
    seller_name: toNullableText(item.seller_name),
    dealer_name: toNullableText(item.dealer_name),
    dealership_name: toNullableText(item.dealership_name),
    dealership_id: toOptionalNumber(item.dealership_id) ?? null,
  };
}

function normalizePagination(raw: unknown, fallbackPage = 1, fallbackLimit = 20): AdsPagination {
  const pagination = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const page = Math.max(1, toNumber(pagination.page, fallbackPage));
  const limit = Math.max(1, toNumber(pagination.limit, fallbackLimit));
  const total = Math.max(0, toNumber(pagination.total, 0));
  const totalPages =
    Math.max(0, toNumber(pagination.totalPages, 0)) || (limit > 0 ? Math.ceil(total / limit) : 0);

  return {
    page,
    limit,
    total,
    totalPages,
  };
}

function normalizeSearchPayload(json: unknown, filters: AdsSearchFilters): AdsSearchResponse {
  const payload = json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  const rawData = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.results)
        ? payload.results
        : [];

  const data = rawData
    .map((item, index) => normalizeAdItem(item, index))
    .filter((item): item is AdItem => Boolean(item));

  const pagination = normalizePagination(
    payload.pagination,
    filters.page || EMPTY_PAGINATION.page,
    filters.limit || EMPTY_PAGINATION.limit
  );

  return {
    success: payload.success !== false,
    ok: payload.ok === true || payload.success !== false,
    filters:
      payload.filters && typeof payload.filters === "object"
        ? (payload.filters as Record<string, unknown>)
        : undefined,
    data,
    pagination,
    error: toNullableText(payload.error),
  };
}

function normalizeFacetArray<T extends Record<string, unknown>>(raw: unknown, keys: string[]): T[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const source = item as Record<string, unknown>;
      const normalized: Record<string, unknown> = {
        total: Math.max(0, toNumber(source.total, 0)),
      };

      for (const key of keys) {
        const value = toText(source[key]);
        if (value) normalized[key] = value;
      }

      return normalized as T;
    })
    .filter((item): item is T => Boolean(item));
}

function normalizeFacetsPayload(json: unknown): AdsFacetsResponse {
  const payload = json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  const rawFacets =
    payload.facets && typeof payload.facets === "object"
      ? (payload.facets as Record<string, unknown>)
      : payload;

  return {
    success: payload.success !== false,
    facets: {
      brands: normalizeFacetArray<{ brand: string; total: number }>(rawFacets.brands, ["brand"]),
      models: normalizeFacetArray<{ brand: string; model: string; total: number }>(
        rawFacets.models,
        ["brand", "model"]
      ),
      fuelTypes: normalizeFacetArray<{ fuel_type: string; total: number }>(
        rawFacets.fuelTypes ?? rawFacets.fuel_types,
        ["fuel_type"]
      ),
      bodyTypes: normalizeFacetArray<{ body_type: string; total: number }>(
        rawFacets.bodyTypes ?? rawFacets.body_types,
        ["body_type"]
      ),
    },
  };
}

export function buildAdsSearchParams(filters: AdsSearchFilters): URLSearchParams {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", filters.q);
  appendIfPresent(params, "brand", filters.brand);
  appendIfPresent(params, "model", filters.model);
  const territory = canonicalTerritoryForApi(filters);
  if (territory.city_slug) params.set("city_slug", territory.city_slug);
  else if (territory.city_id != null) appendIfPresent(params, "city_id", territory.city_id);
  else {
    appendIfPresent(params, "city", territory.city);
    appendIfPresent(params, "state", territory.state);
  }
  appendIfPresent(params, "advertiser_id", filters.advertiser_id);
  appendIfPresent(params, "min_price", filters.min_price);
  appendIfPresent(params, "max_price", filters.max_price);
  appendIfPresent(params, "year_min", filters.year_min);
  appendIfPresent(params, "year_max", filters.year_max);
  appendIfPresent(params, "mileage_max", filters.mileage_max);
  appendIfPresent(params, "fuel_type", filters.fuel_type);
  appendIfPresent(params, "transmission", filters.transmission);
  appendIfPresent(params, "body_type", filters.body_type);
  appendIfPresent(params, "sort", filters.sort);
  appendIfPresent(params, "page", filters.page);
  if (filters.limit != null) {
    appendIfPresent(params, "limit", clampPublicAdsSearchLimit(filters.limit));
  }

  if (filters.below_fipe === true) {
    params.set("below_fipe", "true");
  }

  if (filters.highlight_only === true) {
    params.set("highlight_only", "true");
  }

  return params;
}

export async function fetchAdsSearch(
  filters: AdsSearchFilters,
  signal?: AbortSignal
): Promise<AdsSearchResponse> {
  const apiBase = getApiBaseUrl();
  const params = buildAdsSearchParams(filters);

  try {
    const response = await fetch(`${apiBase}/api/ads/search?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal,
      cache: "no-store",
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return {
        success: false,
        ok: false,
        data: [],
        pagination: normalizePagination(
          null,
          filters.page || EMPTY_PAGINATION.page,
          filters.limit || EMPTY_PAGINATION.limit
        ),
        error: `Falha ao buscar anúncios (${response.status})`,
      };
    }

    const json = await response.json();
    return normalizeSearchPayload(json, filters);
  } catch (error) {
    return {
      success: false,
      ok: false,
      data: [],
      pagination: normalizePagination(
        null,
        filters.page || EMPTY_PAGINATION.page,
        filters.limit || EMPTY_PAGINATION.limit
      ),
      error: error instanceof Error ? error.message : "Falha inesperada ao buscar anúncios.",
    };
  }
}

export async function fetchAdsFacets(
  filters: AdsSearchFilters,
  signal?: AbortSignal
): Promise<AdsFacetsResponse> {
  const apiBase = getApiBaseUrl();
  const params = buildAdsSearchParams({
    city_slug: filters.city_slug,
    city_id: filters.city_id,
    city: filters.city,
    state: filters.state,
    brand: filters.brand,
    model: filters.model,
    fuel_type: filters.fuel_type,
    transmission: filters.transmission,
    body_type: filters.body_type,
    below_fipe: filters.below_fipe,
  });

  try {
    const response = await fetch(`${apiBase}/api/ads/facets?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal,
      cache: "no-store",
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return {
        success: false,
        facets: EMPTY_FACETS,
      };
    }

    const json = await response.json();
    return normalizeFacetsPayload(json);
  } catch {
    return {
      success: false,
      facets: EMPTY_FACETS,
    };
  }
}
