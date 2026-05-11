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
 * Resultado da validação do slug. Três estados explícitos em vez de
 * boolean para o caller distinguir "slug inválido" de "validação falhou".
 */
export type SlugValidation =
  | { kind: "valid" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: string };

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
    return { kind: "unavailable", reason: "BACKEND_API_URL ausente" };
  }
  if (!token) {
    return { kind: "unavailable", reason: "INTERNAL_API_TOKEN ausente" };
  }

  const url = `${apiBase}/api/internal/regions/${encodeURIComponent(safeSlug)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      signal: controller.signal,
      // Next data cache: bate no backend uma vez por slug por janela,
      // depois serve do cache. Cache key inclui URL + headers.
      next: { revalidate, tags: ["internal:regions", `internal:regions:${safeSlug}`] },
    });

    if (response.status === 200) return { kind: "valid" };
    if (response.status === 404) return { kind: "not_found" };

    // 5xx, 4xx outros: unavailable. Não tratar como not_found para evitar
    // 404 falso-positivo durante incidente do backend.
    return {
      kind: "unavailable",
      reason: `backend respondeu ${response.status}`,
    };
  } catch (err) {
    return {
      kind: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
