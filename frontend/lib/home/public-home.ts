import { getBackendApiBaseUrl, getInternalBackendApiBaseUrl } from "@/lib/env/backend-api";
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
  // Private Network do Render quando configurada (SSR-only).
  if (typeof window === "undefined") {
    const internal = getInternalBackendApiBaseUrl();
    if (internal) return stripTrailingSlash(internal);
  }
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

function homeCacheTags(scopeKey: string): string[] {
  const s = scopeKey.trim() || "default";
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
  const tags = homeCacheTags("above-fold");

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
 * Fetch dos carrosseis da Home — filtrados por ESTADO (vitrine estadual).
 *
 * Política territorial atual (substitui o antigo filtro por city_slug):
 *   - A Home é sempre vitrine estadual. Filtrar por cidade restringia o
 *     inventário (ex: SP capital escondia o resto de SP) e fazia o portal
 *     parecer vazio para usuários sem cookie.
 *   - O estado vem do TerritoryResolver (cookie → UF inferida, query → UF
 *     explícita, default → SP).
 *   - Cidade do cookie/usuário é exibida apenas como contexto visual
 *     ("você está em Atibaia, ver carros próximos?") e CTA, nunca como
 *     filtro silencioso dos carrosseis.
 *
 * Fallback global: se o estado não tem destaque/oportunidade/recente para
 * algum carrossel, cai para busca sem filtro de estado. Isso é raro mas
 * acontece em estados com inventário baixo no início do portal.
 */
export async function fetchHomeCarousels(stateUf: string): Promise<HomeCarouselsData> {
  const apiBase = getApiBaseUrl();
  const uf = (stateUf || "").trim().toUpperCase();
  const tags = homeCacheTags(uf || "no-state");

  const withState = (base: Record<string, string | number | boolean>) => {
    const o: Record<string, string | number | boolean> = { ...base };
    if (uf) o.state = uf;
    return o;
  };

  const HIGHLIGHT = { highlight_only: true, limit: 12, sort: "highlight" };
  const OPPORTUNITY = { below_fipe: true, limit: 4 };
  const RECENT = { limit: 8, sort: "recent" };

  // 1a onda: busca estadual.
  const [stateHighlight, stateOpportunity, stateRecent] = await Promise.all([
    fetchAdsCollection(apiBase, withState(HIGHLIGHT), tags),
    fetchAdsCollection(apiBase, withState(OPPORTUNITY), tags),
    fetchAdsCollection(apiBase, withState(RECENT), tags),
  ]);

  // 2a onda: fallback global apenas para carrosseis que vieram vazios.
  // Nao dispara fallback se nao ha estado — evita round-trip.
  const needsHighlightFallback = uf && stateHighlight.length === 0;
  const needsOpportunityFallback = uf && stateOpportunity.length === 0;
  const needsRecentFallback = uf && stateRecent.length === 0;

  const [globalHighlight, globalOpportunity, globalRecent] = await Promise.all([
    needsHighlightFallback ? fetchAdsCollection(apiBase, HIGHLIGHT, tags) : Promise.resolve([]),
    needsOpportunityFallback ? fetchAdsCollection(apiBase, OPPORTUNITY, tags) : Promise.resolve([]),
    needsRecentFallback ? fetchAdsCollection(apiBase, RECENT, tags) : Promise.resolve([]),
  ]);

  return {
    highlightAds: stateHighlight.length ? stateHighlight : globalHighlight,
    opportunityAds: stateOpportunity.length ? stateOpportunity : globalOpportunity,
    recentAds: stateRecent.length ? stateRecent : globalRecent,
  };
}
