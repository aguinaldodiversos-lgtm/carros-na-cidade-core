/**
 * Server-side base URL for the Carros na Cidade API.
 * Mantém a mesma prioridade usada pelo fluxo de auth para evitar divergência
 * entre login/register/me/dashboard e demais chamadas ao backend.
 */

const DEV_FALLBACK_BASE_URL = "http://127.0.0.1:4000";

const BACKEND_API_ENV_KEYS = [
  "AUTH_API_BASE_URL",
  "BACKEND_API_URL",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
] as const;

type BackendApiEnvKey = (typeof BACKEND_API_ENV_KEYS)[number];

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);

    if (!isHttpProtocol(url.protocol)) return "";

    url.search = "";
    url.hash = "";

    const normalizedPathname = stripTrailingSlashes(url.pathname || "");
    url.pathname = normalizedPathname || "/";

    const serialized = url.toString();
    return serialized.endsWith("/") ? serialized.slice(0, -1) : serialized;
  } catch {
    return "";
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return isHttpProtocol(url.protocol);
  } catch {
    return false;
  }
}

function getEnvValue(key: BackendApiEnvKey): string {
  return process.env[key]?.trim() || "";
}

function normalizeRequestPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return "";

  if (isAbsoluteHttpUrl(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function joinUrl(base: string, pathname: string): string {
  const normalizedBase = `${stripTrailingSlashes(base)}/`;
  const relativePath = pathname.replace(/^\/+/, "");
  return new URL(relativePath, normalizedBase).toString();
}

/**
 * Retorna somente a base explicitamente configurada por env, sem fallback local.
 * Útil quando você quer saber se existe uma base real configurada em produção.
 */
export function getBackendApiExplicitEnvUrl(): string {
  for (const key of BACKEND_API_ENV_KEYS) {
    const normalized = normalizeBaseUrl(getEnvValue(key));
    if (normalized) return normalized;
  }

  return "";
}

function getDevFallbackBaseUrl(): string {
  if (process.env.NODE_ENV === "production") return "";
  return normalizeBaseUrl(DEV_FALLBACK_BASE_URL);
}

/**
 * Base final do backend:
 * 1. env explícita válida
 * 2. fallback local em desenvolvimento
 */
export function getBackendApiBaseUrl(): string {
  return getBackendApiExplicitEnvUrl() || getDevFallbackBaseUrl();
}

/**
 * Origem do backend sem path adicional.
 * Ex.:
 * - https://api.meusite.com/api -> https://api.meusite.com
 * - http://127.0.0.1:4000 -> http://127.0.0.1:4000
 */
export function getBackendApiOriginUrl(): string {
  const base = getBackendApiBaseUrl();
  if (!base) return "";

  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

/**
 * Resolve uma URL completa para o backend.
 *
 * Regras:
 * - Se `path` já for URL absoluta, retorna como está.
 * - Se a base terminar em `/api`:
 *   - caminhos `/api/...` continuam sob essa base
 *   - caminhos não-API (ex.: `/uploads/...`) vão para a origem do backend
 * - Se a base NÃO terminar em `/api`, o caminho é resolvido diretamente sobre a base
 *
 * Exemplos:
 * base = https://meu-backend.onrender.com/api
 * - /api/auth/me      -> https://meu-backend.onrender.com/api/auth/me
 * - /uploads/a.jpg    -> https://meu-backend.onrender.com/uploads/a.jpg
 *
 * base = http://127.0.0.1:4000
 * - /api/auth/me      -> http://127.0.0.1:4000/api/auth/me
 * - /uploads/a.jpg    -> http://127.0.0.1:4000/uploads/a.jpg
 */
export function resolveBackendApiUrl(path: string): string {
  const normalizedPath = normalizeRequestPath(path);
  if (!normalizedPath) return "";

  if (isAbsoluteHttpUrl(normalizedPath)) {
    return normalizedPath;
  }

  const base = getBackendApiBaseUrl();
  if (!base) return "";

  try {
    const baseUrl = new URL(base);
    const basePath = stripTrailingSlashes(baseUrl.pathname || "");
    const baseEndsWithApi = basePath.endsWith("/api");

    if (!baseEndsWithApi) {
      return joinUrl(base, normalizedPath);
    }

    if (isApiPath(normalizedPath)) {
      const pathWithoutApiPrefix =
        normalizedPath === "/api"
          ? "/"
          : normalizedPath.replace(/^\/api(?=\/|$)/, "");

      return joinUrl(base, pathWithoutApiPrefix);
    }

    return joinUrl(baseUrl.origin, normalizedPath);
  } catch {
    return "";
  }
}
