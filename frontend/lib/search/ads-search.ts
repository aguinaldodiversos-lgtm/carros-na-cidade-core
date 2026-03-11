export interface AdsSearchFilters {
  q?: string;
  brand?: string;
  model?: string;
  city_id?: number;
  city_slug?: string;
  city?: string;
  state?: string;
  min_price?: number;
  max_price?: number;
  year_min?: number;
  year_max?: number;
  mileage_max?: number;
  fuel_type?: string;
  transmission?: string;
  body_type?: string;
  below_fipe?: boolean;
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
  city?: string;
  state?: string;
  year?: number;
  mileage?: number;
  price?: number;
  below_fipe?: boolean;
  highlight_until?: string | null;
  plan?: string | null;
  created_at?: string;
  image_url?: string | null;
  images?: string[] | null;
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

export interface FacetItem {
  brand?: string;
  model?: string;
  fuel_type?: string;
  body_type?: string;
  total: number;
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

function getApiBaseUrl(): string {
  return (
    process.env.API_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

function appendIfPresent(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  params.set(key, String(value));
}

export function buildAdsSearchParams(filters: AdsSearchFilters): URLSearchParams {
  const params = new URLSearchParams();

  appendIfPresent(params, "q", filters.q);
  appendIfPresent(params, "brand", filters.brand);
  appendIfPresent(params, "model", filters.model);
  appendIfPresent(params, "city_id", filters.city_id);
  appendIfPresent(params, "city_slug", filters.city_slug);
  appendIfPresent(params, "city", filters.city);
  appendIfPresent(params, "state", filters.state);
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
  appendIfPresent(params, "limit", filters.limit);

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

  const response = await fetch(`${apiBase}/api/ads/search?${params.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    cache: "no-store",
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar anúncios (${response.status})`);
  }

  const json = (await response.json()) as AdsSearchResponse;

  if (!json.success || !Array.isArray(json.data) || !json.pagination) {
    throw new Error("Resposta inválida da busca de anúncios");
  }

  return json;
}

export async function fetchAdsFacets(
  filters: AdsSearchFilters,
  signal?: AbortSignal
): Promise<AdsFacetsResponse> {
  const apiBase = getApiBaseUrl();
  const params = buildAdsSearchParams({
    city_id: filters.city_id,
    city_slug: filters.city_slug,
    brand: filters.brand,
    model: filters.model,
    fuel_type: filters.fuel_type,
    transmission: filters.transmission,
    body_type: filters.body_type,
    below_fipe: filters.below_fipe,
  });

  const response = await fetch(`${apiBase}/api/ads/facets?${params.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    cache: "no-store",
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar filtros (${response.status})`);
  }

  const json = (await response.json()) as AdsFacetsResponse;

  if (!json.success || !json.facets) {
    throw new Error("Resposta inválida dos facets");
  }

  return json;
}
