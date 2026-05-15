import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

/**
 * BFF SSR para `GET /api/public/states/:uf/regions`.
 *
 * Rota PÚBLICA do backend (sem token interno) — não precisa de
 * `server-only` no sentido estrito (não vaza segredo), mas mantemos a
 * fetch SSR-resilient para o caching do Next funcionar consistentemente
 * com o restante do portal.
 *
 * Degrade gracioso: retorna `null` em qualquer falha. Caller (página
 * estadual, Home) decide se suprime o bloco ou mostra fallback.
 *
 * Cache (next: { revalidate, tags }):
 *   - revalidate 300 s coincide com o TTL do cache Redis do backend
 *     (`cacheGet({ ttlSeconds: 300 })`). Evita janela em que ISR diz
 *     "sem regiões" enquanto o backend já tem.
 *   - tags ["public:state-regions", "public:state-regions:<uf>"] para
 *     invalidação granular via `revalidateTag` quando admin atualizar
 *     curadoria territorial.
 */

export type StateRegionSummary = {
  slug: string;
  name: string;
  baseCitySlug: string;
  baseCityName: string;
  href: string;
  cityNames: string[];
  citySlugs: string[];
  adsCount: number;
  featuredCount: number;
  radiusKm: number | null;
};

export type StateRegionsPayload = {
  state: {
    code: string;
    slug: string;
  };
  regions: StateRegionSummary[];
};

type BackendEnvelope = {
  success?: boolean;
  data?: {
    state?: { code?: string; slug?: string } | null;
    regions?: Array<Partial<StateRegionSummary>> | null;
  } | null;
  message?: string;
};

const REVALIDATE_SECONDS = 300;

function logWarn(message: string, context?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.warn(`[state-regions:bff] ${message}`, context ?? "");
}

function normalizeRegion(value: unknown): StateRegionSummary | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<StateRegionSummary>;

  if (
    typeof v.slug !== "string" ||
    typeof v.name !== "string" ||
    typeof v.baseCitySlug !== "string" ||
    typeof v.baseCityName !== "string" ||
    typeof v.href !== "string" ||
    !Array.isArray(v.cityNames) ||
    !Array.isArray(v.citySlugs) ||
    typeof v.adsCount !== "number" ||
    typeof v.featuredCount !== "number"
  ) {
    return null;
  }

  return {
    slug: v.slug,
    name: v.name,
    baseCitySlug: v.baseCitySlug,
    baseCityName: v.baseCityName,
    href: v.href,
    cityNames: v.cityNames.map(String),
    citySlugs: v.citySlugs.map(String),
    adsCount: Number(v.adsCount) || 0,
    featuredCount: Number(v.featuredCount) || 0,
    radiusKm: typeof v.radiusKm === "number" ? v.radiusKm : null,
  };
}

export async function fetchStateRegions(
  uf: string,
  options: { limit?: number } = {}
): Promise<StateRegionsPayload | null> {
  const ufNorm = String(uf || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!/^[A-Z]{2}$/.test(ufNorm)) return null;

  if (!getBackendApiBaseUrl()) return null;

  const limitParam =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? `?limit=${Math.min(12, Math.max(1, Math.floor(options.limit)))}`
      : "";

  const url = resolveBackendApiUrl(
    `/api/public/states/${encodeURIComponent(ufNorm.toLowerCase())}/regions${limitParam}`
  );
  if (!url) return null;

  let response: Response;
  try {
    response = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: "state-regions:bff",
      next: {
        revalidate: REVALIDATE_SECONDS,
        tags: ["public:state-regions", `public:state-regions:${ufNorm}`],
      },
    });
  } catch (err) {
    logWarn("falha de rede", { uf: ufNorm, error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  if (!response.ok) {
    if (response.status !== 400 && response.status !== 404) {
      logWarn("status não-OK", { uf: ufNorm, status: response.status });
    }
    return null;
  }

  let envelope: BackendEnvelope | null = null;
  try {
    envelope = (await response.json()) as BackendEnvelope;
  } catch (err) {
    logWarn("body não é JSON", { uf: ufNorm, error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  if (!envelope || envelope.success !== true || !envelope.data) {
    logWarn("envelope inválido", { uf: ufNorm });
    return null;
  }

  const stateData = envelope.data.state;
  if (!stateData?.code || !stateData?.slug) {
    logWarn("state ausente no payload", { uf: ufNorm });
    return null;
  }

  const rawRegions = Array.isArray(envelope.data.regions) ? envelope.data.regions : [];
  const regions = rawRegions
    .map((r) => normalizeRegion(r))
    .filter((r): r is StateRegionSummary => r !== null);

  return {
    state: { code: String(stateData.code), slug: String(stateData.slug) },
    regions,
  };
}
