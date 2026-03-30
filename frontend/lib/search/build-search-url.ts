// frontend/lib/search/build-search-url.ts

export interface BuildSearchUrlOptions {
  basePath?: string;
  q?: string;
  filters?: Record<string, unknown>;
}

function appendIfPresent(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  params.set(key, String(value));
}

export function buildSearchUrl({
  basePath = "/anuncios",
  q,
  filters = {},
}: BuildSearchUrlOptions): string {
  const params = new URLSearchParams();

  if (q && String(q).trim()) {
    params.set("q", String(q).trim());
  }

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
  appendIfPresent(params, "fuel_type", filters.fuel_type);
  appendIfPresent(params, "transmission", filters.transmission);
  appendIfPresent(params, "body_type", filters.body_type);

  if (filters.below_fipe === true) {
    params.set("below_fipe", "true");
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
