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

export interface TerritorialSeoPayload {
  title?: string;
  description?: string;
  canonicalPath?: string;
  robots?: string;
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
 * Payload mínimo de fallback quando o backend está indisponível ou
 * sob rate limit (429). Mantém a página renderizando com estado vazio
 * em vez de derrubar com 500 — usuário vê "sem ofertas" ao invés de
 * tela de erro.
 *
 * Extrai o slug da cidade do routePath quando possível para que ao
 * menos a heading regional seja preenchida.
 */
function buildEmptyTerritorialPayload(routePath: string): TerritorialPagePayload {
  // routePath: /api/public/cities/{slug}[/brand/{brand}[/model/{model}]]
  //          | /api/public/cities/{slug}/opportunities
  //          | /api/public/cities/{slug}/below-fipe
  const match = routePath.match(/\/cities\/([^/]+)/);
  const slug = match ? decodeURIComponent(match[1]) : undefined;
  const cityName = slug
    ? slug
        .split("-")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ")
    : undefined;

  return {
    city: slug && cityName ? { id: 0, name: cityName, slug } : undefined,
    brand: null,
    model: null,
    stats: {},
    signals: {},
    seo: {},
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
    // 429 persistente após retries: o rate-limiter do backend está
    // saturado (tipicamente em SSG/build paralelo). Fazemos graceful
    // degradation — a página renderiza vazia em vez de quebrar com 500.
    if (response.status === 429) {
      // eslint-disable-next-line no-console
      console.error(
        `[territorial] 429 persistente em ${routePath} — retornando payload vazio para não derrubar a página`
      );
      return buildEmptyTerritorialPayload(routePath);
    }
    throw new Error(`Falha ao carregar página territorial (${response.status})`);
  }

  const json = (await response.json()) as TerritorialPageResponse;

  if (!json.success || !json.data) {
    throw new Error("Payload inválido da página territorial");
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
