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
import { readSitemapSnapshot, writeSitemapSnapshot } from "@/lib/seo/sitemap-snapshot";

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
 * De onde veio o conjunto de URLs que estamos servindo.
 *
 * `ok: boolean` respondia "deu certo?" — suficiente para escolher TTL, e
 * insuficiente para escolher STATUS. Com quatro estados explícitos, o caller
 * consegue distinguir o que precisa distinguir:
 *
 *   fresh         backend respondeu agora. Inclui o VAZIO LEGÍTIMO: consulta
 *                 bem-sucedida sem URLs (ex.: `models.xml`, enquanto nenhum
 *                 modelo atinge o limiar) → 200 com urlset vazio, correto.
 *   memory-stale  backend falhou; servindo o último bom deste processo.
 *   redis-stale   backend falhou e a memória está vazia (processo novo);
 *                 servindo o snapshot persistente.
 *   unavailable   backend falhou e NÃO há estado confiável → 503.
 *
 * A distinção que importa: `fresh` com zero URLs é uma afirmação
 * ("não há URLs"); `unavailable` é a ausência de afirmação ("não sei"). Servir
 * as duas como 200 vazio foi o defeito medido em 2026-08-07 — para o Google,
 * a segunda vira a primeira.
 */
export type SitemapSource = "fresh" | "memory-stale" | "redis-stale" | "unavailable";

export interface SitemapFetchResult {
  entries: PublicSitemapEntry[];
  /** `true` apenas em `fresh`. Mantido para os consumidores existentes. */
  ok: boolean;
  source: SitemapSource;
  /** Motivo da degradação. Só para log — nunca vai para header de resposta. */
  reason?: string;
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

/**
 * Caminho de FALHA. Três camadas de recuperação, nesta ordem, e 503 no fim.
 *
 * A quarta possibilidade — devolver `[]` como se fosse resposta — foi removida
 * em 2026-08-07. Ela transformava indisponibilidade em afirmação.
 */
async function degraded(path: string, reason: string): Promise<SitemapFetchResult> {
  logSitemapFailure(path, reason);

  // Camada 2: memória do processo. Cobre o blip com processo já quente.
  const lastGood = lastGoodByPath.get(path);
  if (lastGood?.length) {
    // eslint-disable-next-line no-console
    console.error(
      `[${LOG_TAG}] ${path} → servindo último sitemap bom da MEMÓRIA (${lastGood.length} URLs)`
    );
    return { entries: lastGood, ok: false, source: "memory-stale", reason };
  }

  // Camada 3: snapshot persistente. Cobre o cold start — processo novo, backend
  // já fora. Sem isto, este caminho terminava em 200 com urlset vazio.
  const snapshot = await readSitemapSnapshot(path);
  if (snapshot.kind === "hit") {
    // eslint-disable-next-line no-console
    console.error(
      `[${LOG_TAG}] ${path} → servindo snapshot do REDIS (${snapshot.entries.length} URLs, ` +
        `${Math.round(snapshot.ageMs / 60000)} min)`
    );
    // Reidrata a memória: as próximas requisições deste processo não pagam Redis.
    rememberLastGood(path, snapshot.entries);
    return { entries: snapshot.entries, ok: false, source: "redis-stale", reason };
  }

  // Camada 4: não sabemos. Dizer isso em voz alta (503) é melhor que fingir.
  // eslint-disable-next-line no-console
  console.error(
    `[${LOG_TAG}] ${path} → SEM estado confiável (memória vazia, snapshot ${snapshot.kind}) — 503`
  );
  return { entries: [], ok: false, source: "unavailable", reason };
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
    // Persiste fora do processo. Não bloqueia a resposta e nunca lança: Redis
    // fora custa a camada 3, não o sitemap.
    await writeSitemapSnapshot(path, entries);
    return { entries, ok: true, source: "fresh" };
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

  // A pior origem manda. Se QUALQUER tipo ficou sem estado confiável, o
  // conjunto inteiro é `unavailable`: publicar metade das URLs seria uma
  // remoção silenciosa da outra metade, que é o dano que queremos evitar.
  const source: SitemapSource = results.some((r) => r.source === "unavailable")
    ? "unavailable"
    : results.some((r) => r.source === "redis-stale")
      ? "redis-stale"
      : results.some((r) => r.source === "memory-stale")
        ? "memory-stale"
        : "fresh";

  return {
    entries: source === "unavailable" ? [] : dedupeEntries(results.flatMap((r) => r.entries)),
    ok: results.every((r) => r.ok),
    source,
    reason: results.find((r) => r.reason)?.reason,
  };
}

/**
 * Sitemap de veículos (`/veiculo/[slug]` por anúncio ativo). Endpoint dedicado
 * — a fonte é a tabela `ads`, não os cluster plans dos demais tipos.
 */
export async function fetchPublicVehicleSitemap(limit = 50000): Promise<SitemapFetchResult> {
  return fetchSitemapEntries(`/api/public/seo/sitemap/vehicles?limit=${limit}`);
}

/**
 * UFs que têm conteúdo territorial público — as únicas que merecem um sitemap
 * regional anunciado no index.
 *
 * ── Por que mudou de fonte (2026-08-07) ──────────────────────────────────────
 * Lia `/api/public/seo/sitemap.json`, cujo payload NÃO traz o campo `state`.
 * Resultado medido: sempre `[]` — e o index nunca listou um sitemap regional
 * sequer. O arquivo que a Fase 1 consertou existia e ninguém apontava para ele.
 *
 * A fonte certa é `type/city_home`: as entradas de cidade vêm dos builders de
 * estoque ativo, que já emitem `state` explicitamente (`c.state AS state` na
 * query). Não há parsing de slug envolvido — o backend sabe a UF e a declara.
 *
 * Só entra UF que tem cidade publicável. UF sem estoque não gera sitemap
 * regional e, portanto, não entra no index.
 */
export async function detectAvailableStates(limit = 100000): Promise<string[]> {
  const result = await fetchPublicSitemapByType("city_home", limit);

  // Degradado não vira "nenhuma UF". Anunciar zero regionais porque o backend
  // piscou seria remover do index sitemaps que existem — o mesmo erro do
  // urlset vazio, num nível acima.
  if (result.source === "unavailable") return [];

  const states = new Set<string>();
  for (const entry of result.entries) {
    const uf = String(entry.state || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(uf)) states.add(uf);
  }

  return [...states].sort((a, b) => a.localeCompare(b));
}
