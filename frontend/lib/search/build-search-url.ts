import type { AdsSearchFilters } from "./ads-search";
import { buildSearchQueryString } from "./ads-search-url";

export interface BuildSearchUrlOptions {
  basePath?: string;
  q?: string;
  filters?: Partial<AdsSearchFilters>;
}

export function buildSearchUrl({
  basePath = "/anuncios",
  q,
  filters = {},
}: BuildSearchUrlOptions): string {
  const merged: AdsSearchFilters = { ...filters };

  if (q && String(q).trim()) {
    merged.q = String(q).trim();
  }

  const qs = buildSearchQueryString(merged);
  return qs ? `${basePath}?${qs}` : basePath;
}
