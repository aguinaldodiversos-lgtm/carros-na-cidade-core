/**
 * Preferências territoriais do usuário — armazenadas em cookie próprio
 * (`cnc_territorial_prefs_v1`).
 *
 * Por que cookie separado de `cnc_city`?
 *   - `cnc_city` carrega a cidade ATIVA (CityRef: slug, name, state, label).
 *     É lida pelo CityContext em SSR + client para alimentar UI de cidade.
 *   - `cnc_territorial_prefs_v1` carrega a PREFERÊNCIA do usuário (região
 *     preferida, fonte de descoberta, data da última escolha). Útil para
 *     auditoria UX, banners "Você escolheu Atibaia 30 dias atrás, continua
 *     na região?" e telemetria sem expor PII.
 *
 * Política LGPD:
 *   - SEM coordenadas (lat/long) em momento algum.
 *   - SEM PII (nome, email). Apenas slugs e timestamp.
 *   - Cookie SameSite=Lax, max-age 400 dias (mesmo padrão de `cnc_city`).
 *   - Funções `clearTerritorialPrefs()` para o usuário remover via UI.
 *
 * Shape:
 *   {
 *     city_slug?: string,
 *     region_slug?: string,
 *     state?: string,
 *     source: "geolocation" | "manual" | "cookie" | "default",
 *     updated_at: string  // ISO timestamp
 *   }
 *
 * Não use este storage para canonical/SEO. Robots não leem cookies, então
 * URL canônica nunca pode depender disso.
 */

export const TERRITORIAL_PREFS_COOKIE = "cnc_territorial_prefs_v1";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

export type TerritorialPrefsSource = "geolocation" | "manual" | "cookie" | "default";

export type TerritorialPrefs = {
  city_slug?: string;
  region_slug?: string;
  state?: string;
  source: TerritorialPrefsSource;
  updated_at: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeSource(value: unknown): TerritorialPrefsSource {
  const allowed: TerritorialPrefsSource[] = ["geolocation", "manual", "cookie", "default"];
  if (typeof value === "string" && allowed.includes(value as TerritorialPrefsSource)) {
    return value as TerritorialPrefsSource;
  }
  return "default";
}

function normalizeOptionalSlug(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  // Slug pattern conservador: a-z 0-9 hífen, 2-80 chars.
  if (!/^[a-z0-9-]{2,80}$/.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeStateUf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return undefined;
  return upper;
}

function parsePrefs(raw: unknown): TerritorialPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const source = normalizeSource(obj.source);
  const updatedAt =
    typeof obj.updated_at === "string" && obj.updated_at.trim()
      ? obj.updated_at.trim()
      : new Date(0).toISOString();
  return {
    city_slug: normalizeOptionalSlug(obj.city_slug),
    region_slug: normalizeOptionalSlug(obj.region_slug),
    state: normalizeStateUf(obj.state),
    source,
    updated_at: updatedAt,
  };
}

export function readTerritorialPrefsFromCookie(): TerritorialPrefs | null {
  if (!isBrowser() || !document.cookie) return null;
  const match = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${TERRITORIAL_PREFS_COOKIE}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.split("=").slice(1).join("="));
    return parsePrefs(JSON.parse(value));
  } catch {
    return null;
  }
}

export type WritePrefsInput = {
  citySlug?: string | null;
  regionSlug?: string | null;
  state?: string | null;
  source: TerritorialPrefsSource;
};

export function writeTerritorialPrefs(input: WritePrefsInput): TerritorialPrefs | null {
  if (!isBrowser()) return null;

  const next: TerritorialPrefs = {
    city_slug: normalizeOptionalSlug(input.citySlug ?? undefined),
    region_slug: normalizeOptionalSlug(input.regionSlug ?? undefined),
    state: normalizeStateUf(input.state ?? undefined),
    source: normalizeSource(input.source),
    updated_at: new Date().toISOString(),
  };

  try {
    const payload = encodeURIComponent(JSON.stringify(next));
    document.cookie = `${TERRITORIAL_PREFS_COOKIE}=${payload};path=/;max-age=${COOKIE_MAX_AGE_SEC};SameSite=Lax`;
    return next;
  } catch {
    return null;
  }
}

export function clearTerritorialPrefs(): void {
  if (!isBrowser()) return;
  try {
    document.cookie = `${TERRITORIAL_PREFS_COOKIE}=;path=/;max-age=0;SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/**
 * Lê preferências de um header `Cookie` server-side. Útil para SSR sem
 * depender de `next/headers` (testável em isolamento).
 */
export function parseTerritorialPrefsCookieHeader(
  cookieHeader: string | null | undefined
): TerritorialPrefs | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${TERRITORIAL_PREFS_COOKIE}=`)) {
      const raw = part.slice(TERRITORIAL_PREFS_COOKIE.length + 1);
      try {
        return parsePrefs(JSON.parse(decodeURIComponent(raw)));
      } catch {
        return null;
      }
    }
  }
  return null;
}
