// frontend/lib/home/public-home.ts
export interface HomeDataResponse {
  success: boolean;
  data: {
    featuredCities: Array<{
      id: number;
      name: string;
      slug: string;
      demand_score?: number;
    }>;
    highlightAds: Array<unknown>;
    opportunityAds: Array<unknown>;
    recentAds: Array<unknown>;
    stats: {
      total_ads?: number | string;
      total_cities?: number | string;
      total_advertisers?: number | string;
      total_users?: number | string;
    };
  };
}

function normalizeBaseUrl(url?: string | null) {
  const u = String(url ?? "").trim();
  return u ? u.replace(/\/+$/, "") : "";
}

/**
 * Prioridade:
 * - NEXT_PUBLIC_API_URL (quando você quer apontar explicitamente)
 * - API_URL (server-only)
 * - dev fallback: http://localhost:4000
 *
 * Em produção, evite depender de localhost.
 */
function getApiBaseUrl(): string {
  const fromPublic = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  if (fromPublic) return fromPublic;

  const fromServer = normalizeBaseUrl(process.env.API_URL);
  if (fromServer) return fromServer;

  // fallback somente para dev/local
  return "http://localhost:4000";
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      // cache/revalidate ficam a cargo da página (page.tsx)
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchPublicHomeData(): Promise<HomeDataResponse["data"]> {
  const apiBase = getApiBaseUrl();
  const payload = await fetchJsonWithTimeout<HomeDataResponse>(`${apiBase}/api/public/home`, 8000);

  if (!payload?.success || !payload?.data) {
    throw new Error("Payload inválido da home pública");
  }

  return payload.data;
}
