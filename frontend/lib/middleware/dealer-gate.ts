/**
 * Hard gate de existência para a vitrine pública de loja (`/lojas/[slug]`),
 * executado no `middleware.ts` (Edge runtime, ANTES do App Router processar a
 * request).
 *
 * Por que aqui em vez de só no page.tsx?
 *   Mesmo bug do Next 14.2.35 já contornado por `ad-detail-gate` e
 *   `territory-gate`: `notFound()` em server component — mesmo com
 *   `dynamic = "force-dynamic"` — renderiza o body do not-found mas comita
 *   HTTP 200 (soft-404). Auditoria SEO 2026-07-03 confirmou que
 *   `/lojas/{slug-inexistente}` respondia 200 (a page chamava `notFound()`
 *   mas não havia gate de middleware, ao contrário de `/veiculo`). Middleware
 *   emite 404 HTTP real ANTES do router pegar a rota.
 *
 * Espelha `ad-detail-gate.ts` (mesmo bug, mesma política fail-open): o slug de
 * loja NÃO é validável estruturalmente (qualquer string pode ser uma loja
 * real), então a validação é por existência no backend
 * (`/api/public/dealers/:slug`, que devolve 404 para loja inexistente).
 *
 * Funções puras (sem dependência de Next runtime) para teste isolado.
 */

/** Pathname canônico `/lojas/<slug>`. NÃO casa com sub-rotas. */
const LOJAS_PATH_REGEX = /^\/lojas\/([^/?#]+)\/?$/;

/**
 * Extrai o slug da loja quando o pathname for `/lojas/<slug>`. Devolve `null`
 * para qualquer outro pathname — o caller usa esse `null` para sair cedo sem
 * custar fetch.
 */
export function extractDealerSlug(pathname: string): string | null {
  const match = LOJAS_PATH_REGEX.exec(pathname);
  return match ? match[1] : null;
}

export interface DealerValidationConfig {
  apiBase?: string;
  token?: string;
  /** TTL do cache Next em segundos. Default 60 (loja criada/bloqueada deve
   *  aparecer/desaparecer em até 1min). */
  revalidateSeconds?: number;
  /** Timeout do fetch em ms. Default 6s (gate roda em todo request a
   *  /lojas/* — orçamento curto para não acumular latência). */
  timeoutMs?: number;
  /** Fetch a usar — substituível em teste. */
  fetchImpl?: typeof fetch;
}

/** Mesma taxonomia de `ad-detail-gate` para diagnóstico uniforme. */
export type DealerUnavailableReason =
  | "missing-backend-api-url"
  | "missing-internal-api-token"
  | "backend-401"
  | "backend-403"
  | "backend-5xx"
  | "backend-timeout"
  | "fetch-error";

export type DealerValidation =
  | { kind: "valid" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: DealerUnavailableReason; detail?: string };

/**
 * Bate em `${BACKEND_API_URL}/api/public/dealers/<slug>` autenticado como
 * caller interno (UA cnc-internal/1.0 + X-Internal-Token) para bypassar
 * rate-limit por IP e bot-blocker.
 *
 * - 200 → valid
 * - 404/410 → not_found
 * - 401/403/5xx/timeout/erro → unavailable
 */
export async function validateDealerSlug(
  slug: string,
  config: DealerValidationConfig = {}
): Promise<DealerValidation> {
  const safe = String(slug || "").trim();
  if (!safe) return { kind: "not_found" };

  const apiBase = (config.apiBase ?? process.env.BACKEND_API_URL ?? "").replace(/\/+$/, "");
  const token = (config.token ?? process.env.INTERNAL_API_TOKEN ?? "").trim();
  const revalidate = config.revalidateSeconds ?? 60;
  const timeoutMs = config.timeoutMs ?? 6000;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!apiBase) return { kind: "unavailable", reason: "missing-backend-api-url" };
  if (!token) return { kind: "unavailable", reason: "missing-internal-api-token" };

  const url = `${apiBase}/api/public/dealers/${encodeURIComponent(safe)}`;
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
        "User-Agent": "cnc-internal/1.0",
        "X-Internal-Token": token,
      },
      signal: controller.signal,
      next: { revalidate, tags: ["dealer-gate", `dealer-gate:${safe}`] },
    });

    if (response.status === 200) return { kind: "valid" };
    if (response.status === 404) return { kind: "not_found" };
    if (response.status === 410) return { kind: "not_found" };
    if (response.status === 401) return { kind: "unavailable", reason: "backend-401" };
    if (response.status === 403) return { kind: "unavailable", reason: "backend-403" };
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
 * Decisão pura do gate. Política fail-open idêntica ao `ad-detail-gate`:
 * `unavailable` → pass (não 503), porque o gate roda em TODO request a
 * /lojas/* (incluindo lojas reais). Falhar em cold-start quebraria toda
 * vitrine. A defesa em profundidade vem do `page.tsx`, que ainda chama
 * `notFound()` quando `fetchPublicDealer` retorna null (soft-404 no pior caso
 * — o mesmo estado de antes deste gate, não regride).
 */
export type DealerMiddlewareAction =
  | { kind: "pass-valid" }
  | { kind: "block-not-found" }
  | { kind: "pass-unavailable"; reason: DealerUnavailableReason };

export function decideDealerMiddlewareAction(validation: DealerValidation): DealerMiddlewareAction {
  if (validation.kind === "valid") return { kind: "pass-valid" };
  if (validation.kind === "not_found") return { kind: "block-not-found" };
  return { kind: "pass-unavailable", reason: validation.reason };
}
