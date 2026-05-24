/**
 * Hard gate de existência para o detalhe de anúncio executado no
 * `middleware.ts` (Edge runtime, ANTES do App Router processar a request).
 *
 * Cobre as duas rotas que renderizam o detalhe de um anúncio:
 *   - `/veiculo/[slug]`         (canônica)
 *   - `/anuncios/[identifier]`  (alias legado, 308 → /veiculo/[slug])
 *
 * Por que aqui em vez de só no page.tsx?
 *   Comprovado em produção 2026-05-24 com Next 14.2.35: `notFound()` em
 *   server component — mesmo com `dynamic = "force-dynamic"` + segment-
 *   level `not-found.tsx` — renderiza o body do not-found mas comita
 *   HTTP 200 (soft-404). Esse é o mesmo bug já contornado por
 *   `regional-page-guard` e `territory-gate`. Middleware emite 404 HTTP
 *   real ANTES do router pegar a rota.
 *
 * Funções puras (sem dependência de Next runtime) para serem testadas
 * isoladamente com vitest. O `middleware.ts` importa e monta a
 * `NextResponse` correspondente.
 *
 * Edge runtime considerations:
 *   - `process.env` funciona.
 *   - `fetch` global suporta `next: { revalidate, tags }` para data cache.
 *   - Sem Node APIs (fs, crypto.* node-specific).
 */

/**
 * Pathname canônico `/veiculo/<identifier>`. NÃO casa com sub-rotas
 * (não existem hoje, mas a guarda é barata).
 */
const VEICULO_PATH_REGEX = /^\/veiculo\/([^/?#]+)\/?$/;

/**
 * Pathname legado `/anuncios/<identifier>`. Mesma forma. O page.tsx desta
 * rota redireciona (308) para `/veiculo/<slug>` quando o anúncio existe,
 * mas só após o gate confirmar existência — sem isso, o redirect só roda
 * depois do soft-404.
 */
const ANUNCIOS_PATH_REGEX = /^\/anuncios\/([^/?#]+)\/?$/;

export type AdDetailRoute = "veiculo" | "anuncios";

export interface AdDetailMatch {
  route: AdDetailRoute;
  identifier: string;
}

/**
 * Extrai o identifier (slug ou id) do pathname quando for uma rota de
 * detalhe de anúncio. Devolve `null` para qualquer outro pathname — o
 * caller usa esse `null` para sair cedo sem custar fetch.
 */
export function extractAdDetailMatch(pathname: string): AdDetailMatch | null {
  const veiculo = VEICULO_PATH_REGEX.exec(pathname);
  if (veiculo) return { route: "veiculo", identifier: veiculo[1] };

  const anuncios = ANUNCIOS_PATH_REGEX.exec(pathname);
  if (anuncios) return { route: "anuncios", identifier: anuncios[1] };

  return null;
}

export interface AdDetailValidationConfig {
  apiBase?: string;
  token?: string;
  /** TTL do cache Next em segundos. Default 60 (anúncio criado/pausado
   *  deve aparecer/desaparecer em até 1min, alinhado a `ssrResilientFetch`
   *  do BFF). */
  revalidateSeconds?: number;
  /** Timeout do fetch em ms. Default 6s (gate roda em todo request a
   *  /veiculo/* — orçamento curto para não acumular latência). */
  timeoutMs?: number;
  /** Fetch a usar — substituível em teste. */
  fetchImpl?: typeof fetch;
}

/**
 * Motivos enumerados para `unavailable`. Mesma taxonomia do
 * `regional-page-guard` para uniformizar diagnóstico operacional via
 * header `X-Middleware-Ad-Reason`.
 */
export type AdDetailUnavailableReason =
  | "missing-backend-api-url"
  | "missing-internal-api-token"
  | "backend-401"
  | "backend-403"
  | "backend-5xx"
  | "backend-timeout"
  | "fetch-error";

export type AdDetailValidation =
  | { kind: "valid" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: AdDetailUnavailableReason; detail?: string };

/**
 * Bate em `${BACKEND_API_URL}/api/ads/<identifier>` autenticado como
 * caller interno (UA cnc-internal/1.0 + X-Internal-Token).
 *
 * - 200 → valid
 * - 404 → not_found
 * - 401/403/5xx/timeout/erro → unavailable
 *
 * Cache via `next: { revalidate, tags }` para que requests subsequentes
 * para o mesmo identifier não martelem o backend dentro da janela.
 */
export async function validateAdIdentifier(
  identifier: string,
  config: AdDetailValidationConfig = {}
): Promise<AdDetailValidation> {
  const safeId = String(identifier || "").trim();
  if (!safeId) return { kind: "not_found" };

  const apiBase = (config.apiBase ?? process.env.BACKEND_API_URL ?? "").replace(/\/+$/, "");
  const token = (config.token ?? process.env.INTERNAL_API_TOKEN ?? "").trim();
  const revalidate = config.revalidateSeconds ?? 60;
  const timeoutMs = config.timeoutMs ?? 6000;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!apiBase) return { kind: "unavailable", reason: "missing-backend-api-url" };
  if (!token) return { kind: "unavailable", reason: "missing-internal-api-token" };

  const url = `${apiBase}/api/ads/${encodeURIComponent(safeId)}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // UA + X-Internal-Token autentica como caller interno —
        // `isAuthenticatedInternalCall` no backend bypassa rate-limit
        // por IP (todos os edges do Render saem do mesmo IP) e
        // bot-blocker.
        "User-Agent": "cnc-internal/1.0",
        "X-Internal-Token": token,
      },
      signal: controller.signal,
      next: { revalidate, tags: ["ad-detail-gate", `ad-detail-gate:${safeId}`] },
    });

    if (response.status === 200) return { kind: "valid" };
    if (response.status === 404) return { kind: "not_found" };
    if (response.status === 401) return { kind: "unavailable", reason: "backend-401" };
    if (response.status === 403) return { kind: "unavailable", reason: "backend-403" };
    if (response.status >= 500 && response.status < 600) {
      return { kind: "unavailable", reason: "backend-5xx", detail: `status ${response.status}` };
    }
    return { kind: "unavailable", reason: "backend-5xx", detail: `status ${response.status}` };
  } catch (err) {
    if (timedOut) return { kind: "unavailable", reason: "backend-timeout" };
    return {
      kind: "unavailable",
      reason: "fetch-error",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decisão pura do gate. Recebe o resultado da validação e devolve a ação.
 *
 * Política — diferente do `regional-page-guard` em um ponto crítico:
 *
 *   - regional `unavailable` → 503 (bloqueia). Trade-off: a Regional é
 *     UMA rota; cold-start de backend traduz para 503 com Retry-After.
 *
 *   - ad-detail `unavailable` → pass (deixa passar). Aqui o gate roda
 *     em TODO request a /veiculo/*, incluindo todos os anúncios reais
 *     que existem. Falhar 503 em cold-start quebraria o catálogo
 *     inteiro. Fail-open é seguro porque:
 *       1. O `page.tsx` ainda chama `notFound()` se `fetchAdDetail`
 *          retornar null — defesa em profundidade preservada.
 *       2. Pior caso: anúncio inexistente cai em soft-404 (estado
 *          atual) durante a janela de instabilidade — exatamente o
 *          comportamento que existia antes deste gate, não regride.
 *       3. Logs operacionais ainda capturam `unavailable` via header
 *          `X-Middleware-Ad-Reason`.
 */
export type AdDetailMiddlewareAction =
  | { kind: "pass-valid" }
  | { kind: "block-not-found" }
  | { kind: "pass-unavailable"; reason: AdDetailUnavailableReason };

export function decideAdDetailMiddlewareAction(
  validation: AdDetailValidation
): AdDetailMiddlewareAction {
  if (validation.kind === "valid") return { kind: "pass-valid" };
  if (validation.kind === "not_found") return { kind: "block-not-found" };
  return { kind: "pass-unavailable", reason: validation.reason };
}
