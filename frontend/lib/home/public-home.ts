import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import type { AdItem } from "@/lib/search/ads-search";

export interface HomeDataResponse {
  success: boolean;
  data: {
    featuredCities: Array<{ id: number; name: string; slug: string; demand_score?: number }>;
    highlightAds: AdItem[];
    opportunityAds: AdItem[];
    recentAds: AdItem[];
    adsByState?: Array<{ uf: string; offers: number | string }>;
    stats: {
      total_ads?: number | string;
      total_cities?: number | string;
      total_advertisers?: number | string;
      total_users?: number | string;
    };
  };
}

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
  return stripTrailingSlash(getBackendApiBaseUrl());
}

function fallbackHome(): HomeDataResponse["data"] {
  return {
    featuredCities: [],
    highlightAds: [],
    opportunityAds: [],
    recentAds: [],
    adsByState: [],
    stats: { total_ads: 0, total_cities: 0, total_advertisers: 0, total_users: 0 },
  };
}

function homeCacheTags(citySlug?: string): string[] {
  const s = citySlug?.trim() || "default";
  return ["public-home", `public-home:${s}`];
}

async function fetchJson<T>(url: string, tags: string[]): Promise<T | null> {
  try {
    const response = await ssrResilientFetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      logTag: "public-home",
      // 60s — alinhado a `fetchTerritorialPage` (frontend/lib/search/territorial-public.ts)
      // para evitar janela de 5min em que a Home diz "sem oportunidade" e a página
      // territorial da cidade mostra anúncio recém-publicado.
      next: { revalidate: 60, tags },
    });

    if (!response.ok) {
      if (typeof window === "undefined") {
        console.error(`[public-home] backend ${response.status} on ${url}`);
      }
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchAdsCollection(
  apiBase: string,
  params: Record<string, string | number | boolean>,
  tags: string[]
): Promise<AdItem[]> {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const json = await fetchJson<{
    success?: boolean;
    data?: AdItem[];
  }>(`${apiBase}/api/ads/search?${query.toString()}`, tags);

  return Array.isArray(json?.data) ? json.data : [];
}

/**
 * Home pública por território. Usa `city_slug` + opcionalmente `city_id` para alinhar com o backend.
 * Tags Next.js permitem `revalidateTag` quando houver webhook de invalidação.
 */
export async function fetchPublicHomeData(
  citySlug?: string,
  cityId?: number
): Promise<HomeDataResponse["data"]> {
  const apiBase = getApiBaseUrl();
  const empty = fallbackHome();

  const cs = citySlug?.trim();
  const tags = homeCacheTags(cs);
  const withTerritory = (base: Record<string, string | number | boolean>) => {
    const o: Record<string, string | number | boolean> = { ...base };
    if (cs) o.city_slug = cs;
    if (cityId && Number.isFinite(cityId) && cityId > 0) o.city_id = cityId;
    return o;
  };

  const [homeJson, highlightAds, opportunityAds, recentAds] = await Promise.all([
    fetchJson<HomeDataResponse>(`${apiBase}/api/public/home`, tags),
    fetchAdsCollection(
      apiBase,
      withTerritory({ highlight_only: true, limit: 12, sort: "highlight" }),
      tags
    ),
    fetchAdsCollection(apiBase, withTerritory({ below_fipe: true, limit: 4 }), tags),
    fetchAdsCollection(apiBase, withTerritory({ limit: 8, sort: "recent" }), tags),
  ]);

  const homeData = homeJson?.success && homeJson.data ? homeJson.data : empty;

  return {
    featuredCities: homeData.featuredCities || empty.featuredCities,
    highlightAds: highlightAds.length ? highlightAds : homeData.highlightAds || empty.highlightAds,
    opportunityAds: opportunityAds.length
      ? opportunityAds
      : homeData.opportunityAds || empty.opportunityAds,
    recentAds: recentAds.length ? recentAds : homeData.recentAds || empty.recentAds,
    adsByState: homeData.adsByState || empty.adsByState,
    stats: homeData.stats || empty.stats,
  };
}

export type HomeAboveFoldData = Pick<
  HomeDataResponse["data"],
  "featuredCities" | "adsByState" | "stats"
>;

/**
 * Fetch leve para conteudo acima da dobra (hero + promo + explore por estado).
 * Nao inclui os carrosseis de veiculos — esses sao carregados por Suspense
 * em HomeCarousels, permitindo streaming do HTML e TTFB menor.
 */
export async function fetchHomeAboveFold(): Promise<HomeAboveFoldData> {
  const apiBase = getApiBaseUrl();
  const empty = fallbackHome();
  const tags = homeCacheTags(undefined);

  const homeJson = await fetchJson<HomeDataResponse>(`${apiBase}/api/public/home`, tags);
  const homeData = homeJson?.success && homeJson.data ? homeJson.data : empty;

  return {
    featuredCities: homeData.featuredCities || empty.featuredCities,
    adsByState: homeData.adsByState || empty.adsByState,
    stats: homeData.stats || empty.stats,
  };
}

export type HomeCarouselsData = {
  highlightAds: AdItem[];
  opportunityAds: AdItem[];
  recentAds: AdItem[];
};

/**
 * Fetch pesado dos carrosseis de veiculos — renderizado dentro de <Suspense>
 * para permitir stream do HTML acima da dobra antes destes dados chegarem.
 *
 * Cada carrossel tem fallback global: se a cidade do usuario nao tem ads
 * para aquele criterio (ex.: Sao Paulo capital sem highlight), cai para
 * busca nacional do mesmo criterio. Isso evita home totalmente vazia
 * quando o estoque regional esta zerado — comum em lancamento do portal.
 */
export async function fetchHomeCarousels(
  citySlug?: string,
  cityId?: number
): Promise<HomeCarouselsData> {
  const apiBase = getApiBaseUrl();
  const cs = citySlug?.trim();
  const tags = homeCacheTags(cs);

  const withTerritory = (base: Record<string, string | number | boolean>) => {
    const o: Record<string, string | number | boolean> = { ...base };
    if (cs) o.city_slug = cs;
    if (cityId && Number.isFinite(cityId) && cityId > 0) o.city_id = cityId;
    return o;
  };

  const HIGHLIGHT = { highlight_only: true, limit: 12, sort: "highlight" };
  const OPPORTUNITY = { below_fipe: true, limit: 4 };
  const RECENT = { limit: 8, sort: "recent" };

  // 1a onda: busca territorial.
  const [localHighlight, localOpportunity, localRecent] = await Promise.all([
    fetchAdsCollection(apiBase, withTerritory(HIGHLIGHT), tags),
    fetchAdsCollection(apiBase, withTerritory(OPPORTUNITY), tags),
    fetchAdsCollection(apiBase, withTerritory(RECENT), tags),
  ]);

  // 2a onda: fallback global apenas para carrosseis que vieram vazios.
  // Nao dispara fallback se nao ha filtro territorial — evita round-trip.
  const needsHighlightFallback = cs && localHighlight.length === 0;
  const needsOpportunityFallback = cs && localOpportunity.length === 0;
  const needsRecentFallback = cs && localRecent.length === 0;

  const [globalHighlight, globalOpportunity, globalRecent] = await Promise.all([
    needsHighlightFallback ? fetchAdsCollection(apiBase, HIGHLIGHT, tags) : Promise.resolve([]),
    needsOpportunityFallback ? fetchAdsCollection(apiBase, OPPORTUNITY, tags) : Promise.resolve([]),
    needsRecentFallback ? fetchAdsCollection(apiBase, RECENT, tags) : Promise.resolve([]),
  ]);

  return {
    highlightAds: localHighlight.length ? localHighlight : globalHighlight,
    opportunityAds: localOpportunity.length ? localOpportunity : globalOpportunity,
    recentAds: localRecent.length ? localRecent : globalRecent,
  };
}
