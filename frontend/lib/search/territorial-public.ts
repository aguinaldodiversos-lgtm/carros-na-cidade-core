import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

import type { AdItem, AdsFacetsResponse, AdsPagination } from "./ads-search";

export interface TerritorialCityIdentity {
  id: number | string;
  name: string;
  slug: string;
  state?: string | null;
  region?: string | null;
  stage?: string | null;
  population?: number | null;
}

export interface TerritorialEntityRef {
  name: string;
  slug: string;
}

export interface TerritorialStats {
  totalAds?: number;
  totalBelowFipeAds?: number;
  totalHighlightAds?: number;
  totalOpportunityAds?: number;
  totalLeads?: number;
  totalDealers?: number;
  demandScore?: number;
  dominanceScore?: number;
  opportunityScore?: number;
  predictionScore?: number;
  demandIndex?: number;
  supplyIndex?: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  avgPrice?: number | null;
  minYear?: number | null;
  maxYear?: number | null;
  priorityLevel?: string;
  predictionLabel?: string;
}

export interface TerritorialSignals {
  priorityLevel?: string;
  predictionLabel?: string;
  stage?: string;
  demandIndex?: number;
  supplyIndex?: number;
}

export type TerritorialNoindexReason =
  | "no_active_inventory"
  | "invalid_brand_model"
  | "backend_unavailable"
  | "not_found";

export interface TerritorialSeoPayload {
  title?: string;
  description?: string;
  canonicalPath?: string;
  robots?: string;
  /** Indexação decidida pelo backend a partir do estoque ativo. */
  indexable?: boolean;
  hasActiveInventory?: boolean;
  activeCount?: number;
  noindexReason?: TerritorialNoindexReason | string | null;
}

export interface TerritorialBrandLink {
  brand: string;
  total: number;
  path: string;
}

export interface TerritorialModelLink {
  model: string;
  total: number;
  path: string | null;
  brand?: string;
}

export interface TerritorialInternalLinks {
  city?: string;
  opportunities?: string;
  belowFipe?: string;
  brand?: string;
  model?: string;
  brands?: TerritorialBrandLink[];
  models?: TerritorialModelLink[];
}

export interface TerritorialSections {
  ads?: AdItem[];
  highlightAds?: AdItem[];
  opportunityAds?: AdItem[];
  recentAds?: AdItem[];
  belowFipeAds?: AdItem[];
  relatedBrands?: Array<{ brand: string; total: number }>;
  relatedModels?: Array<{ brand?: string; model: string; total: number }>;
  models?: Array<{ brand: string; model: string; total: number }>;
}

export interface TerritorialPagination {
  ads?: AdsPagination;
  highlightAds?: AdsPagination;
  opportunityAds?: AdsPagination;
  recentAds?: AdsPagination;
  belowFipeAds?: AdsPagination;
}

export interface TerritorialPagePayload {
  city?: TerritorialCityIdentity;
  brand?: TerritorialEntityRef | null;
  model?: TerritorialEntityRef | null;
  stats?: TerritorialStats;
  signals?: TerritorialSignals;
  seo?: TerritorialSeoPayload;
  filters?: Record<string, unknown>;
  sections?: TerritorialSections;
  pagination?: TerritorialPagination;
  facets?: AdsFacetsResponse["facets"] | null;
  internalLinks?: TerritorialInternalLinks;
  generatedAt?: string;
}

interface TerritorialPageResponse {
  success: boolean;
  data: TerritorialPagePayload;
}

export type TerritorialFetchInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | undefined;

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
  const api =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:4000";

  return stripTrailingSlash(api);
}

function appendSearchParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | undefined
) {
  if (value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== undefined) params.append(key, item);
    }
    return;
  }

  params.set(key, value);
}

function toSearchParams(input?: TerritorialFetchInput): URLSearchParams {
  if (!input) return new URLSearchParams();
  if (input instanceof URLSearchParams) return new URLSearchParams(input.toString());

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    appendSearchParam(params, key, value);
  }

  return params;
}

/**
 * Converte o routePath da API no path público canônico equivalente, para que
 * o canonical do fallback aponte para a PRÓPRIA página (self) e nunca para a
 * home "/". Ex.:
 *   /api/public/cities/atibaia-sp/brand/fiat/model/argo
 *     → /cidade/atibaia-sp/marca/fiat/modelo/argo
 */
export function apiRouteToPublicPath(routePath: string): string | undefined {
  const match = routePath.match(
    /\/cities\/([^/?]+)(?:\/brand\/([^/?]+))?(?:\/model\/([^/?]+))?(?:\/(opportunities|below-fipe))?/
  );
  if (!match) return undefined;

  const [, slug, brand, model, suffix] = match;
  if (!slug) return undefined;

  let path = `/cidade/${slug}`;
  if (brand) path += `/marca/${brand}`;
  if (brand && model) path += `/modelo/${model}`;
  if (suffix === "opportunities") path += `/oportunidades`;
  if (suffix === "below-fipe") path += `/abaixo-da-fipe`;
  return path;
}

/**
 * Payload mínimo de fallback quando o backend está indisponível, sob rate
 * limit (429) ou retorna 404. Mantém a página renderizando com estado vazio
 * em vez de derrubar com 500 — usuário vê "sem ofertas" ao invés de erro.
 *
 * CRÍTICO p/ SEO (Fase indexação dinâmica 2026-06-26): o `seo` do fallback é
 * SEMPRE `noindex,follow` com `canonicalPath` = path self (nunca "/"). Antes
 * o fallback devolvia `seo: {}`, o que fazia `buildTerritorialMetadata` cair
 * em canonical "/" e robots index — auto-canonicalizando páginas em erro
 * transitório para a home, indexadas. `noindexReason` explicita a causa.
 */
export function buildEmptyTerritorialPayload(
  routePath: string,
  noindexReason: TerritorialNoindexReason = "backend_unavailable"
): TerritorialPagePayload {
  // routePath: /api/public/cities/{slug}[/brand/{brand}[/model/{model}]]
  //          | /api/public/cities/{slug}/opportunities
  //          | /api/public/cities/{slug}/below-fipe
  const match = routePath.match(/\/cities\/([^/?]+)/);
  const slug = match ? decodeURIComponent(match[1]) : undefined;
  const cityName = slug
    ? slug
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : undefined;

  const canonicalPath = apiRouteToPublicPath(routePath);

  return {
    city: slug && cityName ? { id: 0, name: cityName, slug } : undefined,
    brand: null,
    model: null,
    stats: {},
    signals: {},
    seo: {
      robots: "noindex,follow",
      canonicalPath,
      indexable: false,
      hasActiveInventory: false,
      activeCount: 0,
      noindexReason,
    },
    filters: {},
    sections: {
      ads: [],
      highlightAds: [],
      opportunityAds: [],
      recentAds: [],
      belowFipeAds: [],
      relatedBrands: [],
      relatedModels: [],
      models: [],
    },
    pagination: {},
    facets: null,
    internalLinks: {},
  };
}

async function fetchTerritorialPage(
  routePath: string,
  searchParams?: TerritorialFetchInput
): Promise<TerritorialPagePayload> {
  const apiBase = getApiBaseUrl();
  const params = toSearchParams(searchParams);
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await ssrResilientFetch(`${apiBase}${routePath}${suffix}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    logTag: "territorial",
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    // Degradação graciosa para TODOS os erros: a página nunca cai em 500 nem
    // em canonical "/". Em vez disso renderiza vazia + noindex,follow, com o
    // motivo correto. 404 = cidade/combinação inexistente; 429/5xx = backend
    // saturado ou indisponível (tipicamente SSG/build paralelo ou cold-start).
    const reason: TerritorialNoindexReason =
      response.status === 404 ? "not_found" : "backend_unavailable";
    // eslint-disable-next-line no-console
    console.error(
      `[territorial] ${response.status} em ${routePath} — payload vazio noindex (${reason})`
    );
    return buildEmptyTerritorialPayload(routePath, reason);
  }

  const json = (await response.json()) as TerritorialPageResponse;

  if (!json.success || !json.data) {
    // eslint-disable-next-line no-console
    console.error(`[territorial] payload inválido em ${routePath} — payload vazio noindex`);
    return buildEmptyTerritorialPayload(routePath, "backend_unavailable");
  }

  return json.data;
}

export function fetchCityTerritorialPage(slug: string, searchParams?: TerritorialFetchInput) {
  return fetchTerritorialPage(`/api/public/cities/${encodeURIComponent(slug)}`, searchParams);
}

export function fetchCityBrandTerritorialPage(
  slug: string,
  brand: string,
  searchParams?: TerritorialFetchInput
) {
  return fetchTerritorialPage(
    `/api/public/cities/${encodeURIComponent(slug)}/brand/${encodeURIComponent(brand)}`,
    searchParams
  );
}

export function fetchCityModelTerritorialPage(
  slug: string,
  brand: string,
  model: string,
  searchParams?: TerritorialFetchInput
) {
  return fetchTerritorialPage(
    `/api/public/cities/${encodeURIComponent(slug)}/brand/${encodeURIComponent(brand)}/model/${encodeURIComponent(model)}`,
    searchParams
  );
}

export function fetchCityOpportunitiesTerritorialPage(
  slug: string,
  searchParams?: TerritorialFetchInput
) {
  return fetchTerritorialPage(
    `/api/public/cities/${encodeURIComponent(slug)}/opportunities`,
    searchParams
  );
}

export function fetchCityBelowFipeTerritorialPage(
  slug: string,
  searchParams?: TerritorialFetchInput
) {
  return fetchTerritorialPage(
    `/api/public/cities/${encodeURIComponent(slug)}/below-fipe`,
    searchParams
  );
}
