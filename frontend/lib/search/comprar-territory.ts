import type { AdsSearchFilters } from "@/lib/search/ads-search";

/**
 * Filtros que não são “território puro” — quando presentes, não redirecionamos para cidade fallback
 * só porque a listagem veio vazia (o usuário pode estar restrito demais).
 */
export function isComprarTerritoryOnlyFilters(filters: AdsSearchFilters): boolean {
  return (
    !String(filters.q ?? "").trim() &&
    !String(filters.brand ?? "").trim() &&
    !String(filters.model ?? "").trim() &&
    (filters.min_price === undefined || filters.min_price === null) &&
    (filters.max_price === undefined || filters.max_price === null) &&
    (filters.year_min === undefined || filters.year_min === null) &&
    (filters.year_max === undefined || filters.year_max === null) &&
    (filters.mileage_max === undefined || filters.mileage_max === null) &&
    !String(filters.fuel_type ?? "").trim() &&
    !String(filters.transmission ?? "").trim() &&
    !String(filters.body_type ?? "").trim() &&
    filters.below_fipe !== true &&
    filters.highlight_only !== true &&
    (filters.advertiser_id === undefined || filters.advertiser_id === null)
  );
}
