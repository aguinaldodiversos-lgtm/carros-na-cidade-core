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

/**
 * Envs reservadas para a Private Network do Render: usar URL interna entre
 * services (mesma regiao) reduz bandwidth outbound e latencia.
 *
 * IMPORTANTE: essas variaveis NUNCA podem ser expostas no bundle do client
 * (sem prefixo NEXT_PUBLIC_*). Toda funcao que as le precisa rodar em
 * server-side. Em client a chamada cairia em fallback publico via
 * `getBackendApiBaseUrl()`.
 *
 * Como configurar no Render:
 *   - O hostname interno tem formato `<service-name>.internal` (ex.:
 *     carros-na-cidade-core.internal). Veja o painel: Service > Settings >
 *     "Private network" para o hostname exato. NAO assuma o formato.
 *   - Porta interna padrao do backend e a mesma do build (4000 em dev).
 */
const INTERNAL_BACKEND_API_ENV_KEYS = [
  "INTERNAL_BACKEND_API_URL",
  "BACKEND_INTERNAL_URL",
] as const;

type BackendApiEnvKey = (typeof BACKEND_API_ENV_KEYS)[number];
type InternalBackendApiEnvKey = (typeof INTERNAL_BACKEND_API_ENV_KEYS)[number];

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

function getInternalEnvValue(key: InternalBackendApiEnvKey): string {
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

/**
 * Base URL interna (Private Network) lida de INTERNAL_BACKEND_API_URL ou
 * BACKEND_INTERNAL_URL. SERVER-ONLY: nunca prefixe com NEXT_PUBLIC_*.
 *
 * Retorna string vazia quando nenhuma das envs esta configurada — o caller
 * deve fazer fallback para `getBackendApiBaseUrl()`.
 */
export function getInternalBackendApiBaseUrl(): string {
  for (const key of INTERNAL_BACKEND_API_ENV_KEYS) {
    const normalized = normalizeBaseUrl(getInternalEnvValue(key));
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

/**
 * Resolve uma URL completa do backend preferindo a Private Network quando
 * configurada. Quando nao houver INTERNAL_BACKEND_API_URL, recai no
 * resolvedor publico (`resolveBackendApiUrl`).
 *
 * SERVER-ONLY. Em client, sempre use `resolveBackendApiUrl`.
 *
 * Regras:
 * - se a path ja for absoluta, retorna sem mexer (mesma semantica do publico);
 * - se a base interna terminar em `/api`, segue a mesma logica do publico:
 *   caminhos `/api/...` continuam na base, caminhos sem `/api` vao para a origem.
 */
export function resolveInternalBackendApiUrl(path: string): string {
  const normalizedPath = normalizeRequestPath(path);
  if (!normalizedPath) return "";

  if (isAbsoluteHttpUrl(normalizedPath)) {
    return normalizedPath;
  }

  const internalBase = getInternalBackendApiBaseUrl();
  if (!internalBase) {
    return resolveBackendApiUrl(path);
  }

  try {
    const baseUrl = new URL(internalBase);
    const basePath = stripTrailingSlashes(baseUrl.pathname || "");
    const baseEndsWithApi = basePath.endsWith("/api");

    if (!baseEndsWithApi) {
      return joinUrl(internalBase, normalizedPath);
    }

    if (isApiPath(normalizedPath)) {
      const pathWithoutApiPrefix =
        normalizedPath === "/api" ? "/" : normalizedPath.replace(/^\/api(?=\/|$)/, "");
      return joinUrl(internalBase, pathWithoutApiPrefix);
    }

    return joinUrl(baseUrl.origin, normalizedPath);
  } catch {
    return resolveBackendApiUrl(path);
  }
}

/**
 * Indica se a Private Network esta configurada e tera prioridade sobre o
 * resolvedor publico em chamadas server-side.
 *
 * Util para logs/diagnostico — nao use para alterar headers (envie sempre
 * os internal headers em SSR/BFF, independente da URL ser publica ou privada).
 */
export function isInternalBackendApiConfigured(): boolean {
  return getInternalBackendApiBaseUrl() !== "";
}
