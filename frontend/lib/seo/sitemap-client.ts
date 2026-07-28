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
  /**
   * URLs de imagem para aninhar como `<image:image>` dentro do `<url>`
   * (sitemap de imagens — o Google descontinuou o arquivo dedicado e a prática
   * atual é aninhar no sitemap de páginas).
   *
   * Só o `vehicles.xml` popula hoje. Ordem significativa: a primeira é a capa
   * do anúncio. O backend já filtra o que não é rastreável (relativa ou sob
   * `/api/`, que é Disallow no robots); aqui filtramos de novo por
   * type-safety, não por desconfiança.
   */
  images?: string[];
}

interface PublicSitemapResponse {
  success: boolean;
  data: PublicSitemapEntry[];
}

/**
 * Resultado de uma busca de sitemap.
 *
 * `ok: false` significa "não conseguimos falar com o backend" — NÃO "o backend
 * disse que não há URLs". A distinção é o ponto central do incidente
 * 2026-07-27: antes estas funções devolviam `[]` puro nos dois casos, o caller
 * não tinha como diferenciar, e servia urlset vazio com o MESMO TTL de sucesso
 * (3600s). Um 429 de um segundo congelava o sitemap vazio por uma hora.
 *
 * Quem consome DEVE olhar `ok` para escolher o TTL — ver
 * `app/sitemaps/_lib/sitemap-response.ts`, que centraliza essa regra.
 */
export interface SitemapFetchResult {
  entries: PublicSitemapEntry[];
  ok: boolean;
}

const SITEMAP_REVALIDATE_SECONDS = 3600;

const LOG_TAG = "sitemap-client";

/**
 * Falha de sitemap SEMPRE loga.
 *
 * Antes, três caminhos devolviam `[]` mudos (`!url`, `!res.ok`,
 * `!json.success`) — só erro de rede aparecia, e ainda assim de dentro do
 * `ssrResilientFetch`. Resultado: sitemap vazio em produção por semanas sem
 * uma linha de log. `console.error` porque o Render captura stderr por padrão.
 */
function logSitemapFailure(path: string, reason: string): void {
  if (typeof window !== "undefined") return;
  // eslint-disable-next-line no-console
  console.error(`[${LOG_TAG}] ${path} → urlset degradado: ${reason}`);
}

/**
 * Último resultado BOM por path, em memória do processo.
 *
 * Best-effort deliberado: serve para atravessar um blip (um 429 isolado num
 * fanout) sem despublicar URLs que o Google já conhece. NÃO é durável — morre
 * em restart/deploy e não é compartilhado entre instâncias do Render. Por isso
 * o `ok:false` continua acompanhando o resultado mesmo quando servimos o
 * último bom: o caller ainda precisa aplicar TTL curto e tentar de novo cedo.
 *
 * Só guardamos resultado NÃO-VAZIO: cachear `[]` como "bom" reintroduziria o
 * bug que estamos consertando.
 */
const lastGoodByPath = new Map<string, PublicSitemapEntry[]>();

function rememberLastGood(path: string, entries: PublicSitemapEntry[]): void {
  if (entries.length > 0) lastGoodByPath.set(path, entries);
}

/**
 * Limpa o cache de último-bom. Uso EXCLUSIVO de teste: o cache é estado de
 * módulo e, sem reset, um caso de sucesso contamina o caso de falha seguinte
 * (o degradado passaria a devolver as entries do teste anterior).
 */
export function __resetSitemapLastGoodCache(): void {
  lastGoodByPath.clear();
}

function degraded(path: string, reason: string): SitemapFetchResult {
  logSitemapFailure(path, reason);
  const lastGood = lastGoodByPath.get(path);
  if (lastGood?.length) {
    // eslint-disable-next-line no-console
    console.error(
      `[${LOG_TAG}] ${path} → servindo último sitemap bom (${lastGood.length} URLs) enquanto degradado`
    );
    return { entries: lastGood, ok: false };
  }
  return { entries: [], ok: false };
}

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
    images: normalizeImages(entry.images),
  };
}

/**
 * Mantém só URL de imagem absoluta http(s) e fora de `/api/`.
 *
 * Espelha o guard do backend (`isCrawlableImageUrl` em
 * sitemap-public.service.js) de propósito: este módulo consome JSON de rede e
 * o tipo é só uma promessa. Se o backend estiver numa versão anterior, ou
 * responder algo inesperado, o XML não pode sair com `<image:loc>` relativo
 * (inválido) nem com URL sob `Disallow`.
 *
 * `undefined` quando não sobra nada — o gerador então nem abre as tags.
 */
function normalizeImages(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      if (new URL(url).pathname.startsWith("/api/")) continue;
    } catch {
      continue;
    }
    if (!out.includes(url)) out.push(url);
  }

  return out.length > 0 ? out : undefined;
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
 * NÃO lança — os `route.ts` de sitemap dependem disso para nunca quebrar o
 * build/runtime quando o backend está fora ou em cold-start. Mas, ao contrário
 * da versão anterior, a falha é OBSERVÁVEL: loga e volta com `ok:false`, para
 * o caller poder encurtar o TTL em vez de congelar um urlset vazio por 1h.
 *
 * `ssrResilientFetch` injeta os headers internos (UA cnc-internal/1.0 +
 * X-Internal-Token) automaticamente em server-side. Quando o token bate, a
 * chamada PULA o rate-limit de sitemap do backend (`skipIfAuthenticatedInternal`);
 * quando não bate, cai no cap por minuto e é aqui que os 429 aparecem.
 */
async function fetchSitemapEntries(path: string): Promise<SitemapFetchResult> {
  const url = resolveInternalBackendApiUrl(path);
  if (!url) {
    return degraded(path, "URL do backend não resolvida (env BACKEND_API_URL/API_URL ausente?)");
  }

  try {
    const res = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: LOG_TAG,
      next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
    });

    if (!res.ok) {
      // 429 aqui = rate limit do backend. Ver comentário no topo: sem
      // INTERNAL_API_TOKEN sincronizado, o SSR não pula o cap por minuto.
      return degraded(path, `HTTP ${res.status}`);
    }

    const json = (await res.json()) as PublicSitemapResponse;
    if (!json?.success || !Array.isArray(json.data)) {
      return degraded(
        path,
        `payload inválido (success=${json?.success}, data=${typeof json?.data})`
      );
    }

    const entries = dedupeEntries(json.data.map(normalizeEntry));
    rememberLastGood(path, entries);
    return { entries, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return degraded(path, `exceção: ${message}`);
  }
}

export async function fetchPublicSitemap(limit = 50000): Promise<SitemapFetchResult> {
  return fetchSitemapEntries(`/api/public/seo/sitemap.json?limit=${limit}`);
}

export async function fetchPublicSitemapByType(
  type: string,
  limit = 50000
): Promise<SitemapFetchResult> {
  return fetchSitemapEntries(
    `/api/public/seo/sitemap/type/${encodeURIComponent(type)}?limit=${limit}`
  );
}

export async function fetchPublicSitemapByRegion(
  state: string,
  limit = 50000
): Promise<SitemapFetchResult> {
  return fetchSitemapEntries(
    `/api/public/seo/sitemap/region/${encodeURIComponent(state)}?limit=${limit}`
  );
}

/**
 * Junta múltiplos tipos num só urlset.
 *
 * `ok` é conjuntivo: basta UM tipo falhar para o conjunto ser degradado. Um
 * sitemap montado com metade das fontes é uma remoção silenciosa de URLs do
 * índice — trata-se como falha, não como "resultado menor".
 */
export async function fetchPublicSitemapByTypes(
  types: string[],
  limit = 50000
): Promise<SitemapFetchResult> {
  const results = await Promise.all(types.map((t) => fetchPublicSitemapByType(t, limit)));
  return {
    entries: dedupeEntries(results.flatMap((r) => r.entries)),
    ok: results.every((r) => r.ok),
  };
}

/**
 * Sitemap de veículos (`/veiculo/[slug]` por anúncio ativo). Endpoint dedicado
 * — a fonte é a tabela `ads`, não os cluster plans dos demais tipos.
 */
export async function fetchPublicVehicleSitemap(limit = 50000): Promise<SitemapFetchResult> {
  return fetchSitemapEntries(`/api/public/seo/sitemap/vehicles?limit=${limit}`);
}

export async function detectAvailableStates(limit = 100000): Promise<string[]> {
  const { entries } = await fetchPublicSitemap(limit);
  const states = new Set<string>();

  for (const entry of entries) {
    if (entry.state) states.add(String(entry.state).trim().toUpperCase());
  }

  return [...states].sort((a, b) => a.localeCompare(b));
}
