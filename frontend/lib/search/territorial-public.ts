// frontend/lib/search/territorial-public.ts

import type { AdItem } from "./ads-search";

export interface TerritorialFacetBrand {
  brand: string;
  total: number;
}

export interface TerritorialFacetModel {
  brand: string;
  model: string;
  total: number;
}

export interface TerritorialFacetFuelType {
  fuel_type?: string;
  total: number;
}

export interface TerritorialFacetBodyType {
  body_type?: string;
  total: number;
}

export interface TerritorialPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TerritorialSeo {
  title?: string;
  description?: string;
  canonicalPath?: string;
  robots?: string;
}

export interface TerritorialCityIdentity {
  id?: number;
  name?: string;
  state?: string | null;
  slug?: string;
  stage?: string;
  population?: number;
  region?: string | null;
}

export interface TerritorialCityStats {
  [key: string]: number | string | null | undefined;
}

export interface TerritorialCitySignals {
  [key: string]: number | string | null | undefined;
}

export interface TerritorialInternalLinks {
  city?: string;
  highlights?: string;
  opportunities?: string;
  belowFipe?: string;
  recent?: string;
  brands?: Array<{ brand: string; total: number; path: string }>;
  models?: Array<{ brand?: string; model: string; total: number; path: string }>;
  brand?: string;
  model?: string;
}

export interface TerritorialSections {
  ads?: AdItem[];
  recentAds?: AdItem[];
  highlightAds?: AdItem[];
  opportunityAds?: AdItem[];
  belowFipeAds?: AdItem[];
  models?: TerritorialFacetModel[];
  relatedModels?: TerritorialFacetModel[];
  relatedBrands?: TerritorialFacetBrand[];
}

export interface TerritorialPagePayload {
  city?: TerritorialCityIdentity;
  brand?: {
    name?: string;
    slug?: string;
  };
  model?: {
    name?: string;
    slug?: string;
  };
  stats?: TerritorialCityStats;
  signals?: TerritorialCitySignals;
  seo?: TerritorialSeo;
  filters?: Record<string, unknown>;
  sections?: TerritorialSections;
  pagination?: {
    ads?: TerritorialPagination;
    recentAds?: TerritorialPagination;
    highlightAds?: TerritorialPagination;
    opportunityAds?: TerritorialPagination;
    belowFipeAds?: TerritorialPagination;
  };
  facets?: {
    brands?: TerritorialFacetBrand[];
    models?: TerritorialFacetModel[];
    fuelTypes?: TerritorialFacetFuelType[];
    bodyTypes?: TerritorialFacetBodyType[];
  };
  internalLinks?: TerritorialInternalLinks;
  generatedAt?: string;
}

export interface TerritorialApiResponse {
  success: boolean;
  data: TerritorialPagePayload;
}

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

function toQueryString(
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams
) {
  if (!searchParams) return "";

  if (searchParams instanceof URLSearchParams) {
    return searchParams.toString();
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          params.append(key, item);
        }
      }
      continue;
    }

    if (value !== "") {
      params.set(key, value);
    }
  }

  return params.toString();
}

async function requestTerritorialPage(
  path: string,
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams,
  init?: RequestInit
): Promise<TerritorialPagePayload> {
  const apiBase = getApiBaseUrl();
  const qs = toQueryString(searchParams);
  const url = `${apiBase}${path}${qs ? `?${qs}` : ""}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar página territorial (${response.status})`);
  }

  const json = (await response.json()) as TerritorialApiResponse;

  if (!json.success || !json.data) {
    throw new Error("Payload territorial inválido");
  }

  return json.data;
}

export async function fetchCityTerritorialPage(
  slug: string,
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams,
  init?: RequestInit
) {
  return requestTerritorialPage(`/api/public/cities/${slug}`, searchParams, init);
}

export async function fetchCityBrandTerritorialPage(
  slug: string,
  brand: string,
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams,
  init?: RequestInit
) {
  return requestTerritorialPage(
    `/api/public/cities/${slug}/brand/${brand}`,
    searchParams,
    init
  );
}

export async function fetchCityModelTerritorialPage(
  slug: string,
  brand: string,
  model: string,
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams,
  init?: RequestInit
) {
  return requestTerritorialPage(
    `/api/public/cities/${slug}/brand/${brand}/model/${model}`,
    searchParams,
    init
  );
}

export async function fetchCityOpportunitiesTerritorialPage(
  slug: string,
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams,
  init?: RequestInit
) {
  return requestTerritorialPage(
    `/api/public/cities/${slug}/opportunities`,
    searchParams,
    init
  );
}

export async function fetchCityBelowFipeTerritorialPage(
  slug: string,
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | ReadonlyURLSearchParams,
  init?: RequestInit
) {
  return requestTerritorialPage(
    `/api/public/cities/${slug}/below-fipe`,
    searchParams,
    init
  );
}
