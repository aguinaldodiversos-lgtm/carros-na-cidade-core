import "server-only";
import { toCityRef, type CityRef } from "@/lib/city/city-types";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

/**
 * Resolve metadados canônicos da cidade pelo slug, consultando o
 * endpoint público `/api/public/cities/[slug]` do backend.
 *
 * Compartilhado entre `/carros-em/[slug]` e `/comprar/cidade/[slug]` para
 * evitar drift na resolução de cityRef (id/name/state). Tolerante a
 * falha — retorna `null` em qualquer erro de rede/parse, deixando o
 * caller decidir fallback (tipicamente `cityContextFromSlug`).
 */
export async function resolveCityMeta(slug: string): Promise<CityRef | null> {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;

  try {
    const url = resolveBackendApiUrl(`/api/public/cities/${encodeURIComponent(safeSlug)}`);
    if (!url) return null;

    const res = await ssrResilientFetch(url, {
      headers: { Accept: "application/json" },
      logTag: "city-meta",
      next: { revalidate: 300 },
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: { city?: { id?: number | string; name?: string; slug?: string; state?: string } };
    };
    const c = json?.data?.city;
    if (!c) return null;
    return toCityRef({ id: c.id, slug: c.slug, name: c.name, state: c.state });
  } catch {
    return null;
  }
}
