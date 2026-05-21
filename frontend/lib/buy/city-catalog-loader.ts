import "server-only";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { cityContextFromRef, cityContextFromSlug, hasRestrictiveFilters, normalizeCityFilters, type SearchParams } from "@/lib/buy/territory-variant";
import { resolveCityMeta } from "@/lib/city/resolve-city-meta";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";
import { DEFAULT_COMPRAR_CATALOG_LIMIT } from "@/lib/search/ads-search-url";
import { fetchCatalogAdsTerritoryFallback } from "@/lib/search/catalog-ads-territory-fallback";
import type { BuyCityContext } from "@/lib/buy/catalog-helpers";

/**
 * Loader compartilhado do catálogo de uma cidade — usado por
 * `/carros-em/[slug]` (canônica + catálogo híbrido) e
 * `/comprar/cidade/[slug]` (alias com canonical para a canônica acima).
 *
 * Consolida o fluxo SSR comum:
 *   1. Resolve cityRef no backend público (com fallback para parse do slug).
 *   2. Normaliza filtros (force city_slug, remove state/city redundantes).
 *   3. Busca anúncios + facets em paralelo.
 *   4. Aplica fallback territorial quando a cidade está sem estoque e o
 *      usuário não filtrou — busca a cidade-vizinha mais forte no UF.
 *   5. Defesa contra placeholder R$ 0 (filtra `hasRealPrice`).
 *
 * Retorna o payload pronto para `<BuyMarketplacePageClient />`.
 */

export interface CityCatalogLoadResult {
  ctx: BuyCityContext;
  filters: AdsSearchFilters;
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
  fallbackTerritory?: {
    requestedName: string;
    actualName: string;
    actualState: string;
    actualSlug: string;
  };
}

export interface LoadCityCatalogOptions {
  /**
   * Quando true (default), troca silenciosamente os resultados por
   * anúncios de uma cidade-vizinha quando a cidade pedida está sem
   * estoque — comportamento legado de `/comprar/cidade/[slug]` que
   * dispara um aviso amarelo "mostrando ofertas em X".
   *
   * Na canônica `/carros-em/[slug]` esse fallback é DESLIGADO
   * (briefing territorial 2026-05-20): a listagem principal só pode
   * conter anúncios da cidade. Quando há poucos/zero, o componente
   * `<AlsoInRegionBlock>` oferece a saída regional num bloco
   * visualmente separado, preservando a integridade da "prova local".
   */
  applyTerritoryFallback?: boolean;
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
  const response = value as AdsSearchResponse;
  return (
    Array.isArray(response.data) &&
    Boolean(response.pagination) &&
    typeof response.pagination.page === "number" &&
    typeof response.pagination.limit === "number" &&
    typeof response.pagination.total === "number" &&
    typeof response.pagination.totalPages === "number"
  );
}

function isValidFacetsResponse(value: unknown): value is AdsFacetsResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as AdsFacetsResponse;
  return (
    Boolean(response.facets) &&
    Array.isArray(response.facets.brands) &&
    Array.isArray(response.facets.models) &&
    Array.isArray(response.facets.fuelTypes) &&
    Array.isArray(response.facets.bodyTypes)
  );
}

export async function loadCityCatalogData(
  slug: string,
  searchParams: SearchParams = {},
  options: LoadCityCatalogOptions = {}
): Promise<CityCatalogLoadResult> {
  const { applyTerritoryFallback = true } = options;
  const safeSlug = String(slug || "").trim();
  const ref = await resolveCityMeta(safeSlug);
  const ctx = cityContextFromRef(ref) || cityContextFromSlug(safeSlug);
  const filters = normalizeCityFilters(safeSlug, searchParams);

  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  let initialResults =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  let initialFacets =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  let fallbackTerritory: CityCatalogLoadResult["fallbackTerritory"];

  if (
    applyTerritoryFallback &&
    initialResults.pagination.total === 0 &&
    !hasRestrictiveFilters(filters)
  ) {
    const fallback = await fetchCatalogAdsTerritoryFallback(safeSlug);
    if (fallback && fallback.mode === "fallback" && fallback.slug && fallback.slug !== safeSlug) {
      const fallbackFilters: AdsSearchFilters = { ...filters, city_slug: fallback.slug };
      const [fbResults, fbFacets] = await Promise.allSettled([
        fetchAdsSearch(fallbackFilters),
        fetchAdsFacets(fallbackFilters),
      ]);

      const fbResultsOk =
        fbResults.status === "fulfilled" && isValidResultsResponse(fbResults.value)
          ? fbResults.value
          : null;
      const fbFacetsOk =
        fbFacets.status === "fulfilled" && isValidFacetsResponse(fbFacets.value)
          ? fbFacets.value.facets
          : null;

      if (fbResultsOk && fbResultsOk.pagination.total > 0) {
        initialResults = fbResultsOk;
        initialFacets = fbFacetsOk ?? initialFacets;
        fallbackTerritory = {
          requestedName: ctx.name,
          actualName: fallback.name,
          actualState: fallback.state,
          actualSlug: fallback.slug,
        };
      }
    }
  }

  // Defesa em profundidade contra placeholder R$ 0 — vitrine pública
  // nunca pode mostrar card sem preço real.
  initialResults = {
    ...initialResults,
    data: (initialResults.data || []).filter(hasRealPrice),
  };

  return { ctx, filters, initialResults, initialFacets, fallbackTerritory };
}
