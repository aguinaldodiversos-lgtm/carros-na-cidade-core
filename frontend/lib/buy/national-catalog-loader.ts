import "server-only";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import type { BuyCityContext } from "@/lib/buy/catalog-helpers";
import { normalizeNationalFilters, type SearchParams } from "@/lib/buy/territory-variant";
import { normalizePublicAd } from "@/lib/public-contracts";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";
import { DEFAULT_COMPRAR_CATALOG_LIMIT } from "@/lib/search/ads-search-url";

/**
 * Loader SSR do catálogo NACIONAL — usado por `/comprar`.
 *
 * Terceiro irmão de `state-catalog-loader` e `city-catalog-loader`, com a MESMA
 * sequência (normalizar filtros → buscar ads+facets em paralelo → sanitizar
 * anúncio público). A única diferença é o recorte: nenhum.
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 * `/comprar` respondia 200 renderizando só o diretório de estados e cidades —
 * um índice territorial no lugar da vitrine. Quem tocava "Comprar" caía num
 * menu e precisava de dois cliques (estado → cidade) antes de ver um carro.
 * A rota é a porta de entrada comercial do portal; ela precisa abrir com
 * veículos, e no HTML do servidor, não depois da hidratação.
 *
 * ── Invariante territorial ───────────────────────────────────────────────────
 * Este loader NUNCA injeta território. Não lê cookie, não resolve geolocalização,
 * não escolhe "a cidade com mais estoque". `normalizeNationalFilters` apaga
 * `state`/`city_slug`/`city_slugs`/`city_id`/`city`, e é isso que vai para o
 * backend. Se hoje todo o acervo está em uma cidade só, a busca nacional
 * devolve essa cidade — mas a CONSULTA continua nacional, e é a consulta que
 * define a identidade da rota.
 *
 * ── Falha de backend ≠ Brasil vazio ──────────────────────────────────────────
 * `fetchAdsSearch` nunca lança: em erro/timeout devolve `{ok:false, data:[]}`.
 * Tratar isso como "não há anúncios" é o mecanismo exato que escondeu uma queda
 * de backend por semanas atrás de um cache de lista vazia. `resultsOk` sai no
 * resultado justamente para o caller poder distinguir os dois casos.
 */

export interface NationalCatalogLoadResult {
  /**
   * Contexto sintético do "território Brasil". Existe porque os componentes de
   * catálogo tipam `city: BuyCityContext` — aqui ele só serve de FALLBACK de
   * rótulo quando um anúncio vem sem cidade própria.
   *
   * `state` e `slug` ficam VAZIOS de propósito: `FilterSidebar` deriva o select
   * de Estado de `filters.state || city.state` (vazio ⇒ "Todos os estados") e o
   * link "Apenas <cidade>" de `filters.city_slug || city.slug` (vazio ⇒ não
   * renderiza). Preencher qualquer um dos dois faria a sidebar exibir um
   * recorte territorial que a página não aplicou.
   */
  city: BuyCityContext;
  filters: AdsSearchFilters;
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
  /** `false` quando a busca de anúncios não respondeu — não é "Brasil sem estoque". */
  resultsOk: boolean;
  /** `false` quando as facets falharam; os resultados seguem válidos. */
  facetsOk: boolean;
}

export const NATIONAL_CITY_CONTEXT: BuyCityContext = {
  name: "Brasil",
  state: "",
  slug: "",
  label: "Brasil",
};

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

export async function loadNationalCatalogData(
  searchParams: SearchParams = {}
): Promise<NationalCatalogLoadResult> {
  const filters = normalizeNationalFilters(searchParams);

  // Independentes: nada em facets alimenta a busca e vice-versa. Sequencial
  // aqui somaria a latência das duas no TTFB da porta de entrada do catálogo.
  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  const rawResults =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  const facetsPayload =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value
      : null;

  // Mesma defesa em profundidade da página estadual: `hasRealPrice` derruba o
  // placeholder R$ 0 e `normalizePublicAd` derruba slug inválido / dirty data.
  // Não é uma segunda regra de publicação — status=active e antifraude são do
  // backend; isto só evita renderizar card que quebraria.
  const initialResults: AdsSearchResponse = {
    ...rawResults,
    data: (rawResults.data || []).filter(hasRealPrice).filter((ad) => normalizePublicAd(ad) !== null),
  };

  return {
    city: NATIONAL_CITY_CONTEXT,
    filters,
    initialResults,
    initialFacets: facetsPayload ? facetsPayload.facets : buildEmptyFacets(),
    resultsOk: rawResults.ok !== false && rawResults.success !== false,
    facetsOk: facetsPayload !== null && facetsPayload.success !== false,
  };
}
