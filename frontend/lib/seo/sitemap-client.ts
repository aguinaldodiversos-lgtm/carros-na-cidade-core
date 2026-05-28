// frontend/lib/seo/sitemap-client.ts
//
// Cliente SSR/BFF para os endpoints públicos de sitemap do backend core.
//
// Histórico (Fase 3.1): este módulo usava um `getApiBaseUrl()` próprio (lia só
// API_URL/NEXT_PUBLIC_API_URL, SEM fallback de produção) e um `fetchJsonSafe`
// cru que NÃO enviava os headers internos (UA cnc-internal/1.0 + X-Internal-Token).
// Resultado em prod: os XML de /sitemaps/*.xml ficavam vazios porque:
//   1. sem env explícita, a base resolvia "" → retorno [] imediato;
//   2. mesmo resolvendo, o backend (BAD_BOTS_BLOCKED + sitemapRateLimit 5/min)
//      bloqueava a chamada sem token.
//
// Correção: alinhar ao mesmo padrão dos demais loaders SSR do frontend —
//   - `resolveInternalBackendApiUrl()` (Private Network quando configurada,
//     fallback público com URL de produção embutida);
//   - `ssrResilientFetch()` que injeta os internal headers em server-side e
//     faz retry/backoff para cold-start e 429.

import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

export interface PublicSitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string | number;
  clusterType?: string;
  stage?: string;
  moneyPage?: boolean;
  state?: string;
}

interface PublicSitemapResponse {
  success: boolean;
  data: PublicSitemapEntry[];
}

const SITEMAP_REVALIDATE_SECONDS = 3600;

function normalizeEntry(entry: PublicSitemapEntry): PublicSitemapEntry {
  return {
    ...entry,
    loc: String(entry.loc || "").trim(),
    lastmod: entry.lastmod || undefined,
    changefreq: entry.changefreq || undefined,
    priority:
      entry.priority !== undefined && entry.priority !== null ? Number(entry.priority) : undefined,
    clusterType: entry.clusterType || undefined,
    stage: entry.stage || undefined,
    state: entry.state || undefined,
    moneyPage: Boolean(entry.moneyPage),
  };
}

function dedupeEntries(entries: PublicSitemapEntry[]): PublicSitemapEntry[] {
  const map = new Map<string, PublicSitemapEntry>();

  for (const entry of entries) {
    if (!entry.loc) continue;

    const current = map.get(entry.loc);
    if (!current) {
      map.set(entry.loc, entry);
      continue;
    }

    const currentPriority = Number(current.priority || 0);
    const nextPriority = Number(entry.priority || 0);

    if (nextPriority >= currentPriority) map.set(entry.loc, entry);
  }

  return [...map.values()];
}

/**
 * Busca uma resposta de sitemap do backend e devolve as entries normalizadas.
 *
 * Degrade gracioso: retorna `[]` em qualquer falha (URL não resolvida, !ok,
 * parse, rede). NÃO lança — os `route.ts` de sitemap dependem disso para nunca
 * quebrar o build/runtime quando o backend está fora ou em cold-start.
 *
 * `ssrResilientFetch` injeta os headers internos (UA cnc-internal/1.0 +
 * X-Internal-Token) automaticamente em server-side, então a chamada bypassa o
 * bot-blocker e o rate-limit de sitemap (5/min) do backend.
 */
async function fetchSitemapEntries(path: string): Promise<PublicSitemapEntry[]> {
  const url = resolveInternalBackendApiUrl(path);
  if (!url) return [];

  try {
    const res = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: "sitemap-client",
      next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
    });

    if (!res.ok) return [];

    const json = (await res.json()) as PublicSitemapResponse;
    if (!json?.success || !Array.isArray(json.data)) return [];

    return dedupeEntries(json.data.map(normalizeEntry));
  } catch {
    return [];
  }
}

export async function fetchPublicSitemap(limit = 50000): Promise<PublicSitemapEntry[]> {
  return fetchSitemapEntries(`/api/public/seo/sitemap.json?limit=${limit}`);
}

export async function fetchPublicSitemapByType(
  type: string,
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  return fetchSitemapEntries(
    `/api/public/seo/sitemap/type/${encodeURIComponent(type)}?limit=${limit}`
  );
}

export async function fetchPublicSitemapByRegion(
  state: string,
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  return fetchSitemapEntries(
    `/api/public/seo/sitemap/region/${encodeURIComponent(state)}?limit=${limit}`
  );
}

export async function fetchPublicSitemapByTypes(
  types: string[],
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  const results = await Promise.all(types.map((t) => fetchPublicSitemapByType(t, limit)));
  return dedupeEntries(results.flat());
}

export async function detectAvailableStates(limit = 100000): Promise<string[]> {
  const entries = await fetchPublicSitemap(limit);
  const states = new Set<string>();

  for (const entry of entries) {
    if (entry.state) states.add(String(entry.state).trim().toUpperCase());
  }

  return [...states].sort((a, b) => a.localeCompare(b));
}
