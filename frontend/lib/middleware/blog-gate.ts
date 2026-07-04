import { isValidBrUf } from "./territory-gate";

/**
 * Hard gate de existência para `/blog/[cidade]` (rota DUAL: post do CMS OU hub
 * editorial por cidade), executado no `middleware.ts` (Edge runtime).
 *
 * Problema (auditoria SEO 2026-07-03): o hub aceitava QUALQUER slug e respondia
 * 200 `index,follow` — slug de lixo virava hub-fantasma indexável. Diferente das
 * landings territoriais, o slug do blog NÃO é validável só por forma: um post
 * publicado pode ter slug arbitrário. Então:
 *
 *   1. Slug com forma de cidade canônica (`nome-uf`, UF real) → é um HUB de
 *      cidade legítimo → passa SEM bater no backend (barato, cobre o comum).
 *   2. Qualquer outro slug → pode ser um post publicado; valida por existência
 *      em `/api/public/blog/posts/:slug` (404 = não existe → 404 real).
 *
 * Espelha `dealer-gate`/`ad-detail-gate` (mesmo soft-404 do Next 14.2, mesma
 * política fail-open). Funções puras para teste isolado.
 */

/** `/blog/<slug>` (um único segmento). NÃO casa `/blog`, `/blog/x/y`. */
const BLOG_PATH_REGEX = /^\/blog\/([^/?#]+)\/?$/;

/** Slug canônico de cidade: `nome-uf` (a UF real é validada à parte). */
const CITY_SHAPE_REGEX = /^[a-z0-9-]+-([a-z]{2})$/;

export function extractBlogSlug(pathname: string): string | null {
  const match = BLOG_PATH_REGEX.exec(pathname);
  return match ? match[1] : null;
}

/**
 * True quando o slug tem forma de cidade canônica E a UF final é uma UF
 * brasileira real. Esses são hubs de cidade legítimos (200) e não precisam de
 * checagem de post no backend.
 */
export function isCityHubSlug(slug: string): boolean {
  const m = CITY_SHAPE_REGEX.exec(String(slug || "").trim().toLowerCase());
  return m ? isValidBrUf(m[1]) : false;
}

export interface BlogValidationConfig {
  apiBase?: string;
  token?: string;
  revalidateSeconds?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type BlogUnavailableReason =
  | "missing-backend-api-url"
  | "missing-internal-api-token"
  | "backend-401"
  | "backend-403"
  | "backend-5xx"
  | "backend-timeout"
  | "fetch-error";

export type BlogValidation =
  | { kind: "valid" }
  | { kind: "not_found" }
  | { kind: "unavailable"; reason: BlogUnavailableReason; detail?: string };

/**
 * Bate em `${BACKEND_API_URL}/api/public/blog/posts/<slug>` como caller interno.
 * - 200 → valid (post publicado existe)
 * - 404/410 → not_found
 * - 401/403/5xx/timeout/erro → unavailable
 */
export async function validateBlogPostSlug(
  slug: string,
  config: BlogValidationConfig = {}
): Promise<BlogValidation> {
  const safe = String(slug || "").trim();
  if (!safe) return { kind: "not_found" };

  const apiBase = (config.apiBase ?? process.env.BACKEND_API_URL ?? "").replace(/\/+$/, "");
  const token = (config.token ?? process.env.INTERNAL_API_TOKEN ?? "").trim();
  const revalidate = config.revalidateSeconds ?? 60;
  const timeoutMs = config.timeoutMs ?? 6000;
  const fetchImpl = config.fetchImpl ?? fetch;

  if (!apiBase) return { kind: "unavailable", reason: "missing-backend-api-url" };
  if (!token) return { kind: "unavailable", reason: "missing-internal-api-token" };

  const url = `${apiBase}/api/public/blog/posts/${encodeURIComponent(safe)}`;
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
      next: { revalidate, tags: ["blog-gate", `blog-gate:${safe}`] },
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

/** Fail-open igual aos demais gates: `unavailable` passa (não bloqueia). */
export type BlogMiddlewareAction =
  | { kind: "pass-valid" }
  | { kind: "block-not-found" }
  | { kind: "pass-unavailable"; reason: BlogUnavailableReason };

export function decideBlogMiddlewareAction(validation: BlogValidation): BlogMiddlewareAction {
  if (validation.kind === "valid") return { kind: "pass-valid" };
  if (validation.kind === "not_found") return { kind: "block-not-found" };
  return { kind: "pass-unavailable", reason: validation.reason };
}
