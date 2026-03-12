import type { AdItem } from "@/lib/search/ads-search";

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

const OFFICIAL_PUBLIC_API_URL = "https://carros-na-cidade-api.onrender.com";

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
  const api =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    OFFICIAL_PUBLIC_API_URL;
  return stripTrailingSlash(api);
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

async function fetchJson<T>(url: string, revalidate = 300): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate },
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
  params: Record<string, string | number | boolean>
): Promise<AdItem[]> {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const json = await fetchJson<{
    success?: boolean;
    data?: AdItem[];
  }>(`${apiBase}/api/ads/search?${query.toString()}`, 120);

  return Array.isArray(json?.data) ? json.data : [];
}

export async function fetchPublicHomeData(): Promise<HomeDataResponse["data"]> {
  const apiBase = getApiBaseUrl();
  const empty = fallbackHome();

  const [homeJson, highlightAds, opportunityAds, recentAds] = await Promise.all([
    fetchJson<HomeDataResponse>(`${apiBase}/api/public/home`, 300),
    fetchAdsCollection(apiBase, { highlight_only: true, limit: 4 }),
    fetchAdsCollection(apiBase, { below_fipe: true, limit: 4 }),
    fetchAdsCollection(apiBase, { limit: 8, sort: "recent" }),
  ]);

  const homeData = homeJson?.success && homeJson.data ? homeJson.data : empty;

  return {
    featuredCities: homeData.featuredCities || empty.featuredCities,
    highlightAds: highlightAds.length ? highlightAds : homeData.highlightAds || empty.highlightAds,
    opportunityAds: opportunityAds.length ? opportunityAds : homeData.opportunityAds || empty.opportunityAds,
    recentAds: recentAds.length ? recentAds : homeData.recentAds || empty.recentAds,
    stats: homeData.stats || empty.stats,
  };
}
