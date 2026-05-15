/**
 * Hard gate da Página Regional executado no `middleware.ts`
 * (edge runtime, ANTES do App Router processar a request).
 *
 * Por que aqui em vez de só no page.tsx?
 *   Em Next 14.2 App Router, chamar `notFound()` dentro de um Server
 *   Component renderiza o UI not-found mas pode retornar status HTTP
 *   200 — o `<head>` já foi flushed para o stream, então o status
 *   code não pode mais ser trocado. Reproduzido em produção:
 *   /carros-usados/regiao/regiao-fake-zz-smoke-only retornava 200 com
 *   body contendo `<template data-dgst="NEXT_NOT_FOUND"></template>`.
 *
 *   Middleware roda ANTES do App Router. Retornar `NextResponse(null,
 *   { status: 404 })` aqui garante 404 HTTP real.
 *
 * Funções puras (sem dependência de Next runtime) para que possam ser
 * testadas com vitest sem subir middleware/edge. O `middleware.ts`
 * importa essas funções e monta a `NextResponse`.
 *
 * Edge runtime considerations:
 *   - `process.env` funciona (env vars do service).
 *   - `fetch` global funciona; suporta `next: { revalidate }` para
 *     cache pelo Next data cache.
 *   - Sem acesso a Node APIs (fs, crypto.* node-specific etc.) — não
 *     usamos nenhuma aqui.
 */

/**
 * Regex que casa `/carros-usados/regiao/<slug>` e variantes com trailing
 * slash, mas NÃO `/carros-usados/regiao` puro (sem slug) nem subpaths
 * mais profundos. O slug é capturado em $1.
 */
export const REGIONAL_PATH_REGEX = /^\/carros-usados\/regiao\/([^/?#]+)\/?$/;

/**
 * Contrato estrito da flag, idêntico a `isRegionalPageEnabled()` no
 * server frontend. Apenas a string exata `"true"` libera. Qualquer
 * outro valor (incluindo `"True"`, `"1"`, `"yes"`, `" true "`, vazio,
 * undefined) resolve false.
 *
 * Aceita o env como parâmetro para que o teste possa controlar sem
 * mutar `process.env` global.
 */
export function isFlagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REGIONAL_PAGE_ENABLED === "true";
}

/**
 * Extrai slug do pathname se for rota regional, ou null caso não seja.
 * Útil para o matcher do middleware.
 */
export function extractRegionalSlug(pathname: string): string | null {
  const match = REGIONAL_PATH_REGEX.exec(pathname);
  return match?.[1] ?? null;
}

export interface SlugValidationConfig {
  apiBase?: string;
  token?: string;
  /** TTL do cache Next em segundos. Default 300 (mesmo do BFF). */
  revalidateSeconds?: number;
  /** Timeout do fetch em ms. Default 8s (edge tem limite curto). */
  timeoutMs?: number;
  /** Fetch a usar — substituível em teste. */
  fetchImpl?: typeof fetch;
}

/**
 * Motivos enumerados para `unavailable`. Cada motivo descreve uma falha
 * de configuração/integração distinta, com diagnóstico operacional
 * diferente:
 *
 *   missing-backend-api-url  → env BACKEND_API_URL ausente no service
 *                              do frontend.
 *   missing-internal-api-token → env INTERNAL_API_TOKEN ausente.
 *   backend-401              → token rejeitado pelo backend (não bate
 *                              com INTERNAL_API_TOKEN do backend).
 *   backend-403              → endpoint privado bloqueado para o token.
 *   backend-5xx              → backend respondeu erro 5xx (instabilidade).
 *   backend-timeout          → fetch abortado pelo AbortController após
 *                              `timeoutMs`.
 *   fetch-error              → erro de rede (DNS, TLS, ECONNREFUSED,
 *                              etc.) — fetch lançou exceção.
 *
 * Esses códigos viajam pelo header `X-Middleware-Regional-Reason` para
 * que operadores diagnostiquem produção sem precisar dos logs.
 */
export type UnavailableReason =
  | "missing-backend-api-url"
  | "missing-internal-api-token"
  | "backend-401"
  | "backend-403"
  | "backend-5xx"
  | "backend-timeout"
  | "fetch-error";

/**
 * Resultado da validação do slug. Três estados explícitos em vez de
 * boolean para o caller distinguir "slug inválido" de "validação falhou".
 *
 * Em `unavailable` carregamos o `reason` enumerado (diagnóstico
 * operacional) e opcionalmente `detail` (mensagem livre para log,
 * NUNCA exposto no header HTTP).
 */
export type SlugValidation =
  | { kind: "valid" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: UnavailableReason; detail?: string };

/**
 * Consulta o backend privado `/api/internal/regions/:slug` para descobrir
 * se a cidade-base existe.
 *
 * Decisão de fail-mode quando algo dá errado (token ausente, backend
 * offline, timeout, parse fail):
 *   - Retorna `unavailable`. Caller decide o que fazer.
 *   - Para o middleware: tratar `unavailable` como "deixa passar" —
 *     `notFound()` da page.tsx ainda protege a UI, e melhor deixar
 *     uma cidade válida acessível durante cold start do backend do
 *     que retornar 404 falso-positivo.
 *
 * Cache via `next: { revalidate }` significa que o primeiro fetch para
 * cada slug bate no backend; subsequentes (até `revalidateSeconds`) vêm
 * do cache do Next no edge.
 */
export async function validateRegionalSlug(
  slug: string,
  config: SlugValidationConfig = {}
): Promise<SlugValidation> {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return { kind: "not_found" };

  const apiBase = (config.apiBase ?? process.env.BACKEND_API_URL ?? "").replace(/\/+$/, "");
  const token = (config.token ?? process.env.INTERNAL_API_TOKEN ?? "").trim();
  const revalidate = config.revalidateSeconds ?? 300;
  const timeoutMs = config.timeoutMs ?? 8000;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!apiBase) {
    return { kind: "unavailable", reason: "missing-backend-api-url" };
  }
  if (!token) {
    return { kind: "unavailable", reason: "missing-internal-api-token" };
  }

  const url = `${apiBase}/api/internal/regions/${encodeURIComponent(safeSlug)}`;
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
        // UA cnc-internal/1.0 + token = chamada interna autenticada para o
        // backend. Sem o UA, `isAuthenticatedInternalCall` no bot-blocker
        // retorna false e o backend ratelimit-a pelo IP do container do
        // edge (compartilhado entre todos os SSRs) → todos os requests
        // regionais batem 429 e o guard traduz para backend-5xx → 503.
        //
        // Nao usamos buildInternalBackendHeaders pq este arquivo roda em
        // Edge runtime e ja le `process.env.INTERNAL_API_TOKEN` direto na
        // linha 134. Inlining os 2 headers mantem o codigo Edge-friendly
        // e independente do helper Node-side.
        "User-Agent": "cnc-internal/1.0",
        "X-Internal-Token": token,
      },
      signal: controller.signal,
      // Next data cache: bate no backend uma vez por slug por janela,
      // depois serve do cache. Cache key inclui URL + headers.
      next: { revalidate, tags: ["internal:regions", `internal:regions:${safeSlug}`] },
    });

    if (response.status === 200) return { kind: "valid" };
    if (response.status === 404) return { kind: "not_found" };

    // 401/403: token errado ou negado — não confundir com slug inválido.
    if (response.status === 401) {
      return { kind: "unavailable", reason: "backend-401" };
    }
    if (response.status === 403) {
      return { kind: "unavailable", reason: "backend-403" };
    }
    // 5xx: incidente do backend. Não tratar como not_found para evitar
    // 404 falso-positivo durante cold start ou queda parcial.
    if (response.status >= 500 && response.status < 600) {
      return { kind: "unavailable", reason: "backend-5xx", detail: `status ${response.status}` };
    }
    // Outros 4xx inesperados (415, 429, etc.): rotular como backend-5xx
    // operacionalmente — caller trata igual: bloqueio temporário.
    return {
      kind: "unavailable",
      reason: "backend-5xx",
      detail: `status ${response.status}`,
    };
  } catch (err) {
    if (timedOut) {
      return { kind: "unavailable", reason: "backend-timeout" };
    }
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
 * Decisão pura do middleware regional. Recebe o estado da flag e o
 * resultado da validação; devolve a ação a tomar.
 *
 * Por que separar do middleware?
 *   1. `middleware.ts` precisa de runtime do Next (NextResponse) e roda
 *      no edge — difícil de testar isoladamente sem subir o servidor.
 *   2. Esta função é pura: dado (flag, validation), saída determinística.
 *      Cobertura via unit test é direta e sem mocks de runtime.
 *
 * Política — endurecida em 2026-05-11 após regressão de soft 404 em
 * produção com flag=on (slugs retornavam 200 com app/not-found global
 * porque o middleware caía em fail-open sempre que `BACKEND_API_URL` ou
 * `INTERNAL_API_TOKEN` estavam ausentes/incorretos):
 *
 *   flag off                       → block-flag-off    (HTTP 404)
 *   flag on, valid                 → pass-valid        (HTTP next)
 *   flag on, not_found              → block-not-found  (HTTP 404)
 *   flag on, unavailable (qualquer reason) → block-unavailable (HTTP 503)
 *
 * **Nunca** retorna pass-valid em estado unavailable — esse era o bug
 * que reintroduzia o soft 404 do App Router. Trade-off conhecido: se o
 * backend tiver cold-start ou instabilidade transiente, a Página
 * Regional fica 503 até a janela de cache do Next data cache encher.
 * Aceitável porque (a) o middleware tem `Retry-After: 60`; (b) o
 * smoke detecta `blocked-unavailable` como "bloqueio operacional"
 * (não regressão); (c) 503 com retry é correto SEO/semanticamente,
 * 200 com not-found é soft 404 e Google penaliza.
 */
export type MiddlewareAction =
  | { kind: "block-flag-off" }
  | { kind: "block-not-found" }
  | { kind: "block-unavailable"; reason: UnavailableReason }
  | { kind: "pass-valid" };

export function decideRegionalMiddlewareAction(
  flagOn: boolean,
  validation: SlugValidation
): MiddlewareAction {
  if (!flagOn) return { kind: "block-flag-off" };
  if (validation.kind === "valid") return { kind: "pass-valid" };
  if (validation.kind === "not_found") return { kind: "block-not-found" };
  return { kind: "block-unavailable", reason: validation.reason };
}
