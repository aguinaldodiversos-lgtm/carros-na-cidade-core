/**
 * Server-side base URL for the Carros na Cidade API.
 * Must match login/register (`authService`) so Render can use AUTH_API_BASE_URL / BACKEND_API_URL
 * for auth and dashboard/account calls consistently.
 */
function getDevFallbackBaseUrl(): string {
  if (process.env.NODE_ENV === "production") return "";
  return "http://127.0.0.1:4000";
}

/**
 * Mesma prioridade que `getBackendApiBaseUrl`, mas **sem** fallback localhost de dev.
 * Útil para montar URLs absolutas de imagem quando não há env (ex.: SSR/teste): evita
 * apontar para 127.0.0.1 por engano; o caller pode usar `window.location.origin` no cliente.
 */
export function getBackendApiExplicitEnvUrl(): string {
  const raw =
    process.env.AUTH_API_BASE_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export function getBackendApiBaseUrl(): string {
  const explicit = getBackendApiExplicitEnvUrl();
  if (explicit) return explicit;
  return getDevFallbackBaseUrl().replace(/\/+$/, "");
}

/**
 * Full URL for a path that starts with `/api/...`.
 * If the base already ends with `/api`, the leading `/api` is stripped from the path
 * (same rules as login/me/register).
 */
export function resolveBackendApiUrl(path: string): string {
  const base = getBackendApiBaseUrl();
  if (!base) return "";

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api")) {
    return `${base}${normalizedPath.replace(/^\/api/, "")}`;
  }

  return `${base}${normalizedPath}`;
}
