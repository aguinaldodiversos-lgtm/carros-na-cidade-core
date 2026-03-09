// frontend/lib/home/public-home.ts
export interface HomeDataResponse {
  success: boolean;
  data: {
    featuredCities: Array<{ id: number; name: string; slug: string; demand_score?: number }>;
    highlightAds: Array<any>;
    opportunityAds: Array<any>;
    recentAds: Array<any>;
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
  const api =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  return api ? stripTrailingSlash(api) : "";
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

export async function fetchPublicHomeData(): Promise<HomeDataResponse["data"]> {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return fallbackHome();

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${apiBase}/api/public/home`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    if (!response.ok) return fallbackHome();

    const json = (await response.json()) as HomeDataResponse;
    if (!json?.success || !json?.data) return fallbackHome();

    return json.data;
  } catch {
    return fallbackHome();
  }
}
