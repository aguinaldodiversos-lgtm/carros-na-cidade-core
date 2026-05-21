import "server-only";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import type { BuyCityContext } from "@/lib/buy/catalog-helpers";
import {
  normalizeStateFilters,
  normalizeUf,
  stateNameFromUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";
import { DEFAULT_COMPRAR_CATALOG_LIMIT } from "@/lib/search/ads-search-url";

/**
 * Loader SSR do catálogo estadual — usado por `/carros-usados/[uf]`
 * (canônica, PR 3 do briefing 2026-05-20) e `/comprar/estado/[uf]`
 * (alias com canonical apontando para a canônica).
 *
 * Responsabilidades:
 *   1. Normalizar UF (uppercase 2-letras, valida contra BRAZIL_UFS).
 *   2. Compor filtros canônicos do estado (`state` + defaults — sort
 *      "relevance" default por PR 2.5).
 *   3. Buscar ads + facets em paralelo.
 *   4. Defesa contra placeholder R$ 0 (`hasRealPrice`).
 *
 * Retorna `null` quando a UF é inválida. A `page.tsx` chama `notFound()`
 * nesse caso para retornar HTTP 404 real (não soft-404).
 */

export interface StateCatalogLoadResult {
  uf: string;
  stateName: string;
  city: BuyCityContext;
  filters: AdsSearchFilters;
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
}

function buildEmptyResults(filters: AdsSearchFilters): AdsSearchResponse {
  return {
    success: false,
    ok: false,
    data: [],
    pagination: {
      page: filters.page || 1,
      limit: filters.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
      total: 0,
      totalPages: 1,
    },
    error: null,
  };
}

function buildEmptyFacets(): AdsFacetsResponse["facets"] {
  return { brands: [], models: [], fuelTypes: [], bodyTypes: [] };
}

function isValidResultsResponse(value: unknown): value is AdsSearchResponse {
  if (!value || typeof value !== "object") return false;
  const r = value as AdsSearchResponse;
  return (
    Array.isArray(r.data) &&
    Boolean(r.pagination) &&
    typeof r.pagination.page === "number" &&
    typeof r.pagination.limit === "number" &&
    typeof r.pagination.total === "number" &&
    typeof r.pagination.totalPages === "number"
  );
}

function isValidFacetsResponse(value: unknown): value is AdsFacetsResponse {
  if (!value || typeof value !== "object") return false;
  const r = value as AdsFacetsResponse;
  return (
    Boolean(r.facets) &&
    Array.isArray(r.facets.brands) &&
    Array.isArray(r.facets.models) &&
    Array.isArray(r.facets.fuelTypes) &&
    Array.isArray(r.facets.bodyTypes)
  );
}

export async function loadStateCatalogData(
  rawUf: string,
  searchParams: SearchParams = {}
): Promise<StateCatalogLoadResult | null> {
  const uf = normalizeUf(rawUf);
  if (!uf) return null;

  const stateName = stateNameFromUf(uf);
  const filters = normalizeStateFilters(uf, searchParams);

  const city: BuyCityContext = {
    name: stateName,
    state: uf,
    slug: `estado-${uf.toLowerCase()}`,
    label: `${stateName} (${uf})`,
  };

  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  let initialResults =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  const initialFacets =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  initialResults = {
    ...initialResults,
    data: (initialResults.data || []).filter(hasRealPrice),
  };

  return { uf, stateName, city, filters, initialResults, initialFacets };
}
