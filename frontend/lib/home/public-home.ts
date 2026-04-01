import type { AdItem } from "@/lib/search/ads-search";
import { getBackendApiBaseUrl } from "@/lib/env/backend-api";

export interface HomeDataResponse {
  success: boolean;
  data: {
    featuredCities: Array<{ id: number; name: string; slug: string; demand_score?: number }>;
    highlightAds: AdItem[];
    opportunityAds: AdItem[];
    recentAds: AdItem[];
    stats: {
      total_ads?: number | string;
      total_cities?: number | string;
      total_advertisers?: number | string;
      total_users?: number | string;
    };
  };
}

// URL central — usa NEXT_PUBLIC_API_URL / API_URL / AUTH_API_BASE_URL (frontend/lib/env/backend-api.ts)
function getApiBaseUrl(): string {
  return getBackendApiBaseUrl() || "https://carros-na-cidade-api.onrender.com";
}

function fallbackHome(): HomeDataResponse["data"] {
  return {
    featuredCities: [],
    highlightAds: [],
    opportunityAds: [],
    recentAds: [],
    stats: { total_ads: 0, total_cities: 0, total_advertisers: 0, total_users: 0 },
  };
}

function homeCacheTags(citySlug?: string): string[] {
  const s = citySlug?.trim() || "default";
  return ["public-home", `public-home:${s}`];
}

async function fetchJson<T>(url: string, tags: string[]): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300, tags },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return null;
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
    stats: homeData.stats || empty.stats,
  };
}
