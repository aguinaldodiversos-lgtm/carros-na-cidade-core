/**
 * Server-side base URL for the Carros na Cidade API.
 *
 * Objetivos:
 * - evitar divergência entre auth e demais chamadas ao backend
 * - aceitar explicitamente CNC_API_URL no mesmo resolvedor
 * - manter fallback previsível, mas observável
 */

const DEV_FALLBACK_BASE_URL = "http://127.0.0.1:4000";
const PRODUCTION_FALLBACK_BASE_URL = "https://carros-na-cidade-core.onrender.com";

const BACKEND_API_ENV_KEYS = [
  "AUTH_API_BASE_URL",
  "BACKEND_API_URL",
  "CNC_API_URL",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
] as const;

type BackendApiEnvKey = (typeof BACKEND_API_ENV_KEYS)[number];

export type BackendApiResolutionInfo = {
  baseUrl: string;
  originUrl: string;
  source:
    | "AUTH_API_BASE_URL"
    | "BACKEND_API_URL"
    | "CNC_API_URL"
    | "API_URL"
    | "NEXT_PUBLIC_API_URL"
    | "DEV_FALLBACK_BASE_URL"
    | "PRODUCTION_FALLBACK_BASE_URL"
    | "NONE";
};

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

function getExplicitBackendBaseUrlInfo(): BackendApiResolutionInfo {
  for (const key of BACKEND_API_ENV_KEYS) {
    const normalized = normalizeBaseUrl(getEnvValue(key));
    if (normalized) {
      return {
        baseUrl: normalized,
        originUrl: new URL(normalized).origin,
        source: key,
      };
    }
  }

  return {
    baseUrl: "",
    originUrl: "",
    source: "NONE",
  };
}

function getDevFallbackBaseUrlInfo(): BackendApiResolutionInfo {
  if (process.env.NODE_ENV === "production") {
    return {
      baseUrl: "",
      originUrl: "",
      source: "NONE",
    };
  }

  const normalized = normalizeBaseUrl(DEV_FALLBACK_BASE_URL);
  return {
    baseUrl: normalized,
    originUrl: normalized ? new URL(normalized).origin : "",
    source: normalized ? "DEV_FALLBACK_BASE_URL" : "NONE",
  };
}

function getProductionFallbackBaseUrlInfo(): BackendApiResolutionInfo {
  if (process.env.NODE_ENV !== "production") {
    return {
      baseUrl: "",
      originUrl: "",
      source: "NONE",
    };
  }

  const normalized = normalizeBaseUrl(PRODUCTION_FALLBACK_BASE_URL);
  return {
    baseUrl: normalized,
    originUrl: normalized ? new URL(normalized).origin : "",
    source: normalized ? "PRODUCTION_FALLBACK_BASE_URL" : "NONE",
  };
}

export function getBackendApiResolutionInfo(): BackendApiResolutionInfo {
  const explicit = getExplicitBackendBaseUrlInfo();
  if (explicit.baseUrl) return explicit;

  const devFallback = getDevFallbackBaseUrlInfo();
  if (devFallback.baseUrl) return devFallback;

  const productionFallback = getProductionFallbackBaseUrlInfo();
  if (productionFallback.baseUrl) return productionFallback;

  return {
    baseUrl: "",
    originUrl: "",
    source: "NONE",
  };
}

/**
 * Retorna somente a base explicitamente configurada por env, sem fallback.
 */
export function getBackendApiExplicitEnvUrl(): string {
  return getExplicitBackendBaseUrlInfo().baseUrl;
}

/**
 * Base final do backend:
 * 1. env explícita válida
 * 2. fallback local em desenvolvimento
 * 3. fallback de produção
 */
export function getBackendApiBaseUrl(): string {
  return getBackendApiResolutionInfo().baseUrl;
}

/**
 * Origem do backend sem path adicional.
 */
export function getBackendApiOriginUrl(): string {
  return getBackendApiResolutionInfo().originUrl;
}

/**
 * Resolve uma URL completa para o backend.
 *
 * Regras:
 * - Se `path` já for URL absoluta, retorna como está.
 * - Se a base terminar em `/api`:
 *   - caminhos `/api/...` continuam sob essa base
 *   - caminhos não-API vão para a origem do backend
 * - Se a base NÃO terminar em `/api`, o caminho é resolvido diretamente sobre a base
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
        normalizedPath === "/api" ? "/" : normalizedPath.replace(/^\/api(?=\/|$)/, "");

      return joinUrl(base, pathWithoutApiPrefix);
    }

    return joinUrl(baseUrl.origin, normalizedPath);
  } catch {
    return "";
  }
}
