import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";

export type CatalogAdsTerritoryFallback = {
  mode: "self" | "fallback" | "empty";
  slug: string;
  name: string;
  state: string;
  live_ads: number;
};

/**
 * Resolve território alternativo com anúncios ativos (mesma UF → global), via API pública.
 */
export async function fetchCatalogAdsTerritoryFallback(
  slug: string
): Promise<CatalogAdsTerritoryFallback | null> {
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const base = getBackendApiBaseUrl();
  if (!base) return null;

  const url = resolveBackendApiUrl(
    `/api/public/cities/${encodeURIComponent(normalized)}/catalog-ads-fallback`
  );
  if (!url) return null;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: CatalogAdsTerritoryFallback;
    };
    if (!res.ok || !json.success || !json.data?.slug) return null;
    return json.data;
  } catch {
    return null;
  }
}
