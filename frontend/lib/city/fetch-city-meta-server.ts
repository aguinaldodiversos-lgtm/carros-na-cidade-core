import { normalizeCityId } from "@/lib/city/city-types";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

type CityPayload = {
  city?: { id?: number | string; name?: string; state?: string | null; slug?: string };
};

export type CityMetaLite = {
  id?: number;
  name: string;
  state: string;
};

/** Metadados da cidade (inclui id para filtros com `city_id`) — SSR / home. */
export async function fetchCityMetaBySlug(slug: string): Promise<CityMetaLite | null> {
  const s = slug.trim();
  if (!s) return null;

  if (!getBackendApiBaseUrl()) return null;

  const url = resolveBackendApiUrl(`/api/public/cities/${encodeURIComponent(s)}`);
  if (!url) return null;

  try {
    const res = await ssrResilientFetch(url, {
      headers: { Accept: "application/json" },
      logTag: "city-meta",
      next: { revalidate: 300, tags: [`city-meta:${s}`, "city-meta"] },
    });
    const text = await res.text();
    const json = (text ? JSON.parse(text) : {}) as { data?: CityPayload };
    const c = json?.data?.city;
    if (!c?.name) return null;
    const state = String(c.state || "SP")
      .trim()
      .toUpperCase()
      .slice(0, 2);
    return {
      id: normalizeCityId(c.id),
      name: String(c.name).trim(),
      state: state || "SP",
    };
  } catch {
    return null;
  }
}
