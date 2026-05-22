import "server-only";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import type { BuyCityContext } from "@/lib/buy/catalog-helpers";
import type { SearchParams } from "@/lib/buy/territory-variant";
import {
  fetchRegionByCitySlug,
  regionToAdsSearchFilters,
  type RegionPayload,
} from "@/lib/regions/fetch-region";
import { sortAdsByPriorityAndProximity } from "@/lib/regions/regional-facets";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";
import {
  DEFAULT_COMPRAR_CATALOG_LIMIT,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";

/**
 * Loader SSR do catálogo regional — `/carros-usados/regiao/[slug]`.
 *
 * Responsabilidades:
 *   1. Resolver `RegionPayload` (cidade-base + members + radius_km) via BFF
 *      `/api/internal/regions/:slug`.
 *   2. Compor filtros canônicos da região (`city_slugs[]` com a base no
 *      índice 0 para preservar o boost `baseCityBoostExpr` do backend).
 *   3. Aplicar overrides de usuário do `searchParams` SEM tocar em
 *      `city_slugs`/`state` — manter a contenção territorial.
 *   4. Buscar `ads` e `facets` em paralelo.
 *   5. Reordenar defensivamente via `sortAdsByPriorityAndProximity` —
 *      garante o invariante "tier domina, cidade-base só desempata
 *      dentro do tier" mesmo se o backend tiver cache divergente.
 *
 * Retorna `null` quando a região não é resolvível (slug inválido,
 * cidade não cadastrada). A `page.tsx` chama `notFound()` nesse caso.
 */

export interface RegionalCatalogLoadResult {
  region: RegionPayload;
  /** BuyCityContext da cidade-base — alimenta o `<CatalogPageHeader>`. */
  city: BuyCityContext;
  /** UF normalizada (uppercase). */
  stateUf: string;
  /** Raio configurado no backend (platform_settings.regional.radius_km). */
  radiusKm: number;
  /** Filtros finais enviados ao `fetchAdsSearch` (city_slugs + overrides). */
  filters: AdsSearchFilters;
  /** Anúncios já reordenados defensivamente por tier/proximidade. */
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

function readFromSearchParams(searchParams: SearchParams) {
  return {
    get(name: string) {
      const v = searchParams[name];
      if (Array.isArray(v)) return v[0] ?? null;
      return v ?? null;
    },
  };
}

/**
 * Filtros aceitos do usuário no regional. Excluímos qualquer dimensão
 * territorial — a região é a verdade canônica. Em particular não aceitamos
 * `state`, `city`, `city_id`, `city_slug`, `city_slugs` do usuário.
 *
 * PENDÊNCIA — filtros de distância (briefing 2026-05-20, item 7):
 *   chips "Até 30 km / 50 km / 80 km / 100 km" estão listados em "filtros
 *   avançados" mas NÃO foram implementados nesta entrega. Razão:
 *
 *     1. O backend não aceita `distance_max_km` como filtro de query.
 *        O raio é resolvido no SSR via `platform_settings.regional.radius_km`
 *        + `region_memberships`. Adicionar suporte exige Zod schema novo
 *        no `ads-filter.schema.js` + SQL builder + boost compatível com
 *        `baseCityBoostExpr`.
 *
 *     2. Filtro client-side post-fetch quebraria paginação: a página 2
 *        pode pular anúncios que a página 1 filtrou localmente, gerando
 *        UX inconsistente.
 *
 *   Estratégia recomendada para próxima iteração: filtrar `region.members`
 *   por `distance_km <= maxKm` AQUI no SSR loader, ANTES de chamar
 *   `regionToAdsSearchFilters` — recompõe `city_slugs[]` com o subset que
 *   atende ao raio do usuário. Funciona sem mexer no backend, mantém
 *   paginação consistente e respeita o cap `MAX_CITY_SLUGS=30`.
 */
function pickUserOverrides(searchParams: SearchParams): Partial<AdsSearchFilters> {
  const parsed = parseAdsSearchFiltersFromSearchParams(readFromSearchParams(searchParams));
  const overrides: Partial<AdsSearchFilters> = {};

  if (parsed.brand !== undefined) overrides.brand = parsed.brand;
  if (parsed.model !== undefined) overrides.model = parsed.model;
  if (parsed.year_min !== undefined) overrides.year_min = parsed.year_min;
  if (parsed.year_max !== undefined) overrides.year_max = parsed.year_max;
  if (parsed.mileage_max !== undefined) overrides.mileage_max = parsed.mileage_max;
  if (parsed.min_price !== undefined) overrides.min_price = parsed.min_price;
  if (parsed.max_price !== undefined) overrides.max_price = parsed.max_price;
  if (parsed.body_type !== undefined) overrides.body_type = parsed.body_type;
  if (parsed.fuel_type !== undefined) overrides.fuel_type = parsed.fuel_type;
  if (parsed.transmission !== undefined) overrides.transmission = parsed.transmission;
  if (parsed.below_fipe !== undefined) overrides.below_fipe = parsed.below_fipe;
  if (parsed.opportunity !== undefined) overrides.opportunity = parsed.opportunity;
  if (parsed.highlight_only !== undefined) overrides.highlight_only = parsed.highlight_only;
  if (parsed.priority_tier !== undefined) overrides.priority_tier = parsed.priority_tier;
  if (parsed.seller_kind !== undefined) overrides.seller_kind = parsed.seller_kind;
  if (parsed.q !== undefined) overrides.q = parsed.q;
  if (parsed.sort !== undefined) overrides.sort = parsed.sort;
  if (parsed.page !== undefined) overrides.page = parsed.page;
  if (parsed.limit !== undefined) overrides.limit = parsed.limit;

  return overrides;
}

export async function loadRegionalCatalogData(
  slug: string,
  searchParams: SearchParams = {}
): Promise<RegionalCatalogLoadResult | null> {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;

  const region = await fetchRegionByCitySlug(safeSlug);
  if (!region || !region.base) return null;

  const radiusKm = (region as RegionPayload & { radius_km?: number }).radius_km ?? 80;
  const stateUf = region.base.state.toUpperCase();

  const city: BuyCityContext = {
    slug: region.base.slug,
    name: region.base.name,
    state: stateUf,
    label: `${region.base.name} (${stateUf})`,
  };

  // Filtros base: city_slugs[base, ...members] + state. Garantem
  // contenção territorial e o boost cidade-base no ranking SQL.
  const baseFilters = regionToAdsSearchFilters(region, { includeState: true });
  const userOverrides = pickUserOverrides(searchParams);

  // Merge: começa com filtros base e aplica overrides do user POR CIMA,
  // exceto city_slugs/state que são readonly da região. Esses dois campos
  // não estão em `pickUserOverrides`, então o spread é seguro.
  const filters: AdsSearchFilters = {
    ...baseFilters,
    sort: userOverrides.sort ?? baseFilters.sort ?? "relevance",
    page: userOverrides.page ?? 1,
    limit: userOverrides.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
    ...userOverrides,
    // Re-aplica para forçar precedência (TS spread literal):
    city_slugs: baseFilters.city_slugs,
    state: baseFilters.state,
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

  // Defesa contra placeholder R$ 0 — vitrine pública nunca pode mostrar
  // card sem preço real.
  const filteredData = (initialResults.data || []).filter(hasRealPrice);

  // Reordenação defensiva: o backend já aplica `buildSortClause` +
  // `baseCityBoostExpr`. Este sort garante a regra "tier domina,
  // cidade-base só desempata dentro do tier" mesmo se um cache antigo
  // do BFF servir resultados com tier inconsistente.
  const sortedData = sortAdsByPriorityAndProximity(filteredData, region.base, region.members);

  initialResults = {
    ...initialResults,
    data: sortedData,
  };

  return {
    region,
    city,
    stateUf,
    radiusKm,
    filters,
    initialResults,
    initialFacets,
  };
}
