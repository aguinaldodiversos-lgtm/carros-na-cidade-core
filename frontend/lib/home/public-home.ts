export interface HomeDataResponse {
  success: boolean;
  data: {
    featuredCities: Array<{
      id: number;
      name: string;
      slug: string;
      demand_score?: number;
    }>;
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

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

export async function fetchPublicHomeData(): Promise<HomeDataResponse["data"]> {
  const apiBase = getApiBaseUrl();

  const response = await fetch(`${apiBase}/api/public/home`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    next: {
      revalidate: 300,
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar home pública (${response.status})`);
  }

  const json = (await response.json()) as HomeDataResponse;

  if (!json.success || !json.data) {
    throw new Error("Payload inválido da home pública");
  }

  return json.data;
}
