import "server-only";
import { getBackendApiBaseUrl, resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import type { AdsSearchFilters } from "@/lib/search/ads-search";

/**
 * BFF server-only do payload de Região para a Página Regional e o
 * resolver territorial.
 *
 * ESCOLHA DE ENDPOINT (Fase 7, 2026-05-18 briefing):
 *   Default: `/api/internal/regions/:slug` (com X-Internal-Token, cache
 *   5min) — preservado por compatibilidade com testes e configuração
 *   existente em produção.
 *
 *   Opt-in: `REGIONAL_BFF_USE_PUBLIC=true` ativa o novo
 *   `/api/public/regions/:citySlug` (sem token, cache 15min, payload
 *   sanitizado). Reduz dependência de INTERNAL_API_TOKEN no SSR e
 *   padroniza contrato com terceiros/crawlers. Ativar no Render via env
 *   var quando confortável (sem deploy de código).
 *
 *   O middleware do frontend (`lib/regional-page-guard.ts`) continua
 *   usando o INTERNAL por design (gate hard-404 + cache 5min consistente).
 *
 * Por que server-only?
 * - O header X-Internal-Token (fallback) usa process.env.INTERNAL_API_TOKEN,
 *   que NUNCA pode vazar no bundle do client. `import "server-only"` faz
 *   o Next abortar o build se algum client component importar este arquivo.
 *
 * Por que degrade gracioso (null) em vez de throw?
 * - A Página Regional renderiza com graceful fallback se a região não
 *   estiver disponível. Crash em SSR poluiria o ISR e geraria página de
 *   erro pública. Regional é "extra"; sua ausência nunca pode quebrar a
 *   navegação.
 *
 * Cache (next: { revalidate, tags }):
 * - Endpoint público: revalidate=900 (15 min, alinha com TTL Redis).
 * - Endpoint internal: revalidate=300 (5 min, alinha com TTL Redis).
 * - tags ["regions", "regions:<slug>"] permitem invalidar uma região via
 *   `revalidateTag('regions:atibaia-sp')` ou tudo via `revalidateTag('regions')`.
 *
 * Estados retornando null:
 *   - Backend base URL não configurada (silencioso).
 *   - HTTP 404 (slug desconhecido).
 *   - HTTP 5xx, timeout, qualquer erro de rede ou parse.
 */

export type RegionMember = {
  city_id: number;
  slug: string;
  name: string;
  state: string;
  /** 1 = vizinha próxima (≤30 km); 2 = vizinha intermediária (30-60 km). */
  layer: number;
  distance_km: number | null;
};

export type RegionBase = {
  id: number;
  slug: string;
  name: string;
  state: string;
};

export type RegionPayload = {
  base: RegionBase;
  members: RegionMember[];
  /**
   * Raio em km efetivamente usado pelo backend para montar `members`.
   * Vem de `platform_settings.regional.radius_km` (default 80, range
   * 10..150, editável por admin). Pode estar ausente em respostas do
   * legado (`getRegionByBaseSlug`) — caller deve aplicar fallback.
   */
  radius_km?: number;
};

/**
 * Envelope do endpoint INTERNAL `/api/internal/regions/:slug`.
 * Mantido para fallback quando `REGIONAL_BFF_USE_INTERNAL=true`.
 */
type InternalBackendEnvelope = {
  ok?: boolean;
  data?: {
    base?: Partial<RegionBase> | null;
    members?: Array<Partial<RegionMember>> | null;
    radius_km?: number | null;
  } | null;
  error?: string;
};

/**
 * Envelope do endpoint PUBLIC `/api/public/regions/:citySlug`.
 * Shape mais rico (state.name, canonicalUrl, lat/lng do baseCity, members
 * com cityId/distanceKm em camelCase) — adaptado abaixo para o shape
 * interno `RegionPayload` esperado pelos callers.
 */
type PublicBackendEnvelope = {
  success?: boolean;
  data?: {
    region?: {
      slug?: string;
      name?: string;
      canonicalUrl?: string;
      radiusKm?: number;
    };
    baseCity?: {
      id?: number;
      name?: string;
      slug?: string;
      state?: string;
      latitude?: number | null;
      longitude?: number | null;
    };
    state?: { code?: string; slug?: string; name?: string };
    members?: Array<{
      cityId?: number;
      name?: string;
      slug?: string;
      state?: string;
      distanceKm?: number | null;
      layer?: number;
    }>;
    citySlugs?: string[];
    adsCount?: number;
    featuredCount?: number;
  } | null;
  error?: string;
};

const PUBLIC_REVALIDATE_SECONDS = 900; // 15 min (alinha com TTL do endpoint público)
const INTERNAL_REVALIDATE_SECONDS = 300; // 5 min (legado)

/**
 * Por default, BFF usa o endpoint INTERNAL (token + cache 5min) — preserva
 * compatibilidade. Setar `REGIONAL_BFF_USE_PUBLIC=true` alterna para o
 * endpoint PUBLIC (sem token + cache 15min). Quando o público comprovar
 * estabilidade em produção, inverteremos o default.
 */
function shouldUsePublicEndpoint(): boolean {
  return process.env.REGIONAL_BFF_USE_PUBLIC === "true";
}

function logWarn(message: string, context?: Record<string, unknown>) {
  // Logger frontend = console em SSR. Não poluir produção com info debug.
  // eslint-disable-next-line no-console
  console.warn(`[regions:bff] ${message}`, context ?? "");
}

function logError(message: string, context?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error(`[regions:bff] ${message}`, context ?? "");
}

function readInternalApiToken(): string {
  return String(process.env.INTERNAL_API_TOKEN || "").trim();
}

function isPlausibleBase(value: unknown): value is RegionBase {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<RegionBase>;
  return (
    typeof v.id === "number" &&
    typeof v.slug === "string" &&
    typeof v.name === "string" &&
    typeof v.state === "string"
  );
}

function normalizeMember(value: unknown): RegionMember | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<RegionMember>;
  if (
    typeof v.city_id !== "number" ||
    typeof v.slug !== "string" ||
    typeof v.name !== "string" ||
    typeof v.state !== "string" ||
    typeof v.layer !== "number"
  ) {
    return null;
  }
  return {
    city_id: v.city_id,
    slug: v.slug,
    name: v.name,
    state: v.state,
    layer: v.layer,
    distance_km:
      v.distance_km === null || v.distance_km === undefined ? null : Number(v.distance_km),
  };
}

/**
 * Adapta o envelope do endpoint PUBLIC para o shape interno `RegionPayload`
 * esperado pelos callers (page.tsx, territory-resolver, ads-search filters).
 *
 * O endpoint público usa shape mais rico (camelCase, com state.name e
 * lat/lng do baseCity). O caller não precisa saber dessa diferença —
 * o adapter mantém o contrato `RegionPayload` consistente.
 */
function adaptPublicToRegionPayload(envelope: PublicBackendEnvelope): RegionPayload | null {
  const data = envelope?.data;
  if (!data || !data.baseCity) return null;
  const baseCity = data.baseCity;
  if (
    typeof baseCity.id !== "number" ||
    typeof baseCity.slug !== "string" ||
    typeof baseCity.name !== "string" ||
    typeof baseCity.state !== "string"
  ) {
    return null;
  }
  const base: RegionBase = {
    id: baseCity.id,
    slug: baseCity.slug,
    name: baseCity.name,
    state: baseCity.state,
  };
  const rawMembers = Array.isArray(data.members) ? data.members : [];
  const members: RegionMember[] = rawMembers
    .map((m) => {
      if (
        typeof m?.cityId !== "number" ||
        typeof m?.slug !== "string" ||
        typeof m?.name !== "string" ||
        typeof m?.state !== "string" ||
        typeof m?.layer !== "number"
      ) {
        return null;
      }
      return {
        city_id: m.cityId,
        slug: m.slug,
        name: m.name,
        state: m.state,
        layer: m.layer,
        distance_km:
          m.distanceKm === null || m.distanceKm === undefined ? null : Number(m.distanceKm),
      };
    })
    .filter((m): m is RegionMember => m !== null);

  const rawRadius = data.region?.radiusKm;
  const radius_km =
    typeof rawRadius === "number" && Number.isFinite(rawRadius) && rawRadius > 0
      ? rawRadius
      : undefined;

  return { base, members, radius_km };
}

/**
 * Implementação interna que consulta o endpoint PUBLIC `/api/public/regions/:citySlug`.
 *
 * Sem token. Cache 15min (alinha com TTL do endpoint público).
 */
async function fetchFromPublicEndpoint(safeSlug: string): Promise<RegionPayload | null> {
  const base = getBackendApiBaseUrl();
  if (!base) return null;

  const url = `${base.replace(/\/+$/, "")}/api/public/regions/${encodeURIComponent(safeSlug)}`;

  let response: Response;
  try {
    response = await ssrResilientFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // UA não-curl para evitar bot-blocker do backend (UA "cnc-ssr/1.0"
        // foi configurado como SSR legítimo no whitelist do backend).
        "User-Agent": "cnc-ssr/1.0",
      },
      logTag: "regions:bff:public",
      next: {
        revalidate: PUBLIC_REVALIDATE_SECONDS,
        tags: ["regions", `regions:${safeSlug}`],
      },
    });
  } catch (err) {
    logError("falha de rede ao buscar região (público)", {
      slug: safeSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    logError("backend público retornou status não-OK", {
      slug: safeSlug,
      status: response.status,
    });
    return null;
  }

  let envelope: PublicBackendEnvelope | null = null;
  try {
    envelope = (await response.json()) as PublicBackendEnvelope;
  } catch (err) {
    logError("body do público não é JSON parseável", {
      slug: safeSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!envelope || envelope.success !== true || !envelope.data) {
    logError("envelope público inválido (success!=true ou sem .data)", {
      slug: safeSlug,
    });
    return null;
  }

  return adaptPublicToRegionPayload(envelope);
}

/**
 * Implementação INTERNAL legada — usada como fallback opt-in via
 * `REGIONAL_BFF_USE_INTERNAL=true`. Mantida intacta para retrocompat.
 */
async function fetchFromInternalEndpoint(safeSlug: string): Promise<RegionPayload | null> {
  const token = readInternalApiToken();
  if (!token) {
    logWarn(
      "INTERNAL_API_TOKEN não configurado e REGIONAL_BFF_USE_INTERNAL=true — desligue a flag ou configure o token."
    );
    return null;
  }

  if (!getBackendApiBaseUrl()) return null;

  const url = resolveInternalBackendApiUrl(`/api/internal/regions/${encodeURIComponent(safeSlug)}`);
  if (!url) return null;

  let response: Response;
  try {
    response = await ssrResilientFetch(url, {
      method: "GET",
      headers: {
        ...buildInternalBackendHeaders(),
        Accept: "application/json",
      },
      logTag: "regions:bff",
      next: {
        revalidate: INTERNAL_REVALIDATE_SECONDS,
        tags: ["internal:regions", `internal:regions:${safeSlug}`],
      },
    });
  } catch (err) {
    logError("falha de rede ao buscar região (internal)", {
      slug: safeSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    logError("backend internal retornou status não-OK", {
      slug: safeSlug,
      status: response.status,
    });
    return null;
  }

  let envelope: InternalBackendEnvelope | null = null;
  try {
    envelope = (await response.json()) as InternalBackendEnvelope;
  } catch (err) {
    logError("body internal não é JSON parseável", {
      slug: safeSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!envelope || envelope.ok !== true || !envelope.data) {
    logError("envelope internal inválido", { slug: safeSlug });
    return null;
  }

  const base = envelope.data.base;
  if (!isPlausibleBase(base)) {
    logError("base internal com shape inválido", { slug: safeSlug, base });
    return null;
  }

  const rawMembers = Array.isArray(envelope.data.members) ? envelope.data.members : [];
  const members = rawMembers
    .map((m) => normalizeMember(m))
    .filter((m): m is RegionMember => m !== null);

  const rawRadius = envelope.data.radius_km;
  const radius_km =
    typeof rawRadius === "number" && Number.isFinite(rawRadius) && rawRadius > 0
      ? rawRadius
      : undefined;

  return { base, members, radius_km };
}

/**
 * Lê a região aproximada de uma cidade-base no backend.
 *
 * Por default usa `/api/internal/regions/:slug` (token + cache 5min).
 * Setando `REGIONAL_BFF_USE_PUBLIC=true`, troca para
 * `/api/public/regions/:citySlug` (sem token + cache 15min). A inversão
 * do default acontecerá quando o público comprovar estabilidade em prod.
 *
 * Retorna `null` em qualquer falha (degrade gracioso) — caller deve sempre
 * tratar null como "região não disponível agora".
 */
export async function fetchRegionByCitySlug(slug: string): Promise<RegionPayload | null> {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;

  if (shouldUsePublicEndpoint()) {
    return fetchFromPublicEndpoint(safeSlug);
  }
  return fetchFromInternalEndpoint(safeSlug);
}

/**
 * Overrides permitidos no helper regionToAdsSearchFilters.
 *
 * Intencionalmente NÃO inclui `city_slugs` nem `state` — essas duas dimensões
 * pertencem exclusivamente à região (RegionPayload) e ao toggle `includeState`.
 * Permitir que o caller passasse `city_slugs` ou `state` aqui abriria a porta
 * para "vazar" a busca para fora da região-pivot, furando a contenção
 * territorial que justifica o boost de city_slugs[0] no ranking.
 */
export type RegionToAdsSearchFiltersOptions = {
  brand?: string;
  model?: string;
  price_min?: number;
  price_max?: number;
  year_min?: number;
  year_max?: number;
  mileage_min?: number;
  mileage_max?: number;
  page?: number;
  sort?: string;
  below_fipe?: boolean;
  highlight_only?: boolean;
  /** Quando true, adiciona `state = region.base.state`. Default: false. */
  includeState?: boolean;
};

/**
 * Cap de city_slugs alinhado ao backend (Zod schema do /api/ads/search).
 * Manter sincronizado com `MAX_CITY_SLUGS` em src/modules/ads/filters/.
 */
const MAX_CITY_SLUGS = 30;

/**
 * Transforma um RegionPayload em AdsSearchFilters pronto para fetchAdsSearch.
 *
 * Por que city_slugs[0] = cidade-base?
 * - O backend (src/modules/ads/filters/ads-ranking.sql.js → baseCityBoostExpr)
 *   adiciona +60 pontos de boost a anúncios cuja `c.slug = city_slugs[0]`,
 *   dentro da mesma camada comercial. Manter a base no índice 0 garante que
 *   a Página Regional priorize anúncios da cidade-pivot sem alterar a SQL.
 *   A ordem do array é semanticamente significativa: inverter member/base
 *   inverte qual cidade ganha preferência no ranking.
 *
 * Por que overrides não pode mexer em city_slugs nem state?
 * - city_slugs vem do RegionPayload (cidade-base + members aprovados).
 *   Permitir override violaria a contenção territorial e poderia "vazar"
 *   resultados para outra região por engano.
 * - state, quando habilitado via includeState=true, vem de region.base.state.
 *   Cidades de UF diferente em algumas fronteiras já são filtradas no
 *   backend pela camada de region_memberships; o helper não deve permitir
 *   que o caller troque isso.
 *
 * Por que throw em region null/undefined?
 * - Retornar `{}` silenciosamente faria o backend cair em busca ampla
 *   (sem qualquer território). Em produção isso seria uma página regional
 *   exibindo anúncios do Brasil inteiro — bug visível e regressão de SEO.
 *   Falhar cedo, alto e claro é mais seguro.
 */
export function regionToAdsSearchFilters(
  region: RegionPayload,
  options: RegionToAdsSearchFiltersOptions = {}
): AdsSearchFilters {
  if (region == null) {
    throw new Error(
      "regionToAdsSearchFilters: parâmetro `region` é obrigatório (recebeu null/undefined). Não retornamos {} silenciosamente para evitar uma busca ampla acidental sem território."
    );
  }

  const baseSlug = typeof region.base?.slug === "string" ? region.base.slug.trim() : "";
  const seen = new Set<string>();
  const orderedSlugs: string[] = [];

  if (baseSlug) {
    orderedSlugs.push(baseSlug);
    seen.add(baseSlug);
  }

  const members = Array.isArray(region.members) ? region.members : [];
  for (const member of members) {
    if (orderedSlugs.length >= MAX_CITY_SLUGS) break;
    const slug = typeof member?.slug === "string" ? member.slug.trim() : "";
    if (!slug || seen.has(slug)) continue;
    orderedSlugs.push(slug);
    seen.add(slug);
  }

  const filters: AdsSearchFilters = {
    city_slugs: orderedSlugs,
  };

  // Overrides complementares — NUNCA atingem city_slugs nem state.
  // Mapeia nomes do helper (price_min/price_max) para os nomes do contrato
  // AdsSearchFilters (min_price/max_price) que o backend já espera.
  if (options.brand !== undefined) filters.brand = options.brand;
  if (options.model !== undefined) filters.model = options.model;
  if (options.price_min !== undefined) filters.min_price = options.price_min;
  if (options.price_max !== undefined) filters.max_price = options.price_max;
  if (options.year_min !== undefined) filters.year_min = options.year_min;
  if (options.year_max !== undefined) filters.year_max = options.year_max;
  if (options.mileage_max !== undefined) filters.mileage_max = options.mileage_max;
  // mileage_min consta nos overrides do spec para forward-compat, mas
  // AdsSearchFilters / contrato público do backend não definem `mileage_min`
  // hoje — aceito na assinatura, ignorado na propagação.
  if (options.page !== undefined) filters.page = options.page;
  if (options.sort !== undefined) filters.sort = options.sort;
  if (options.below_fipe !== undefined) filters.below_fipe = options.below_fipe;
  if (options.highlight_only !== undefined) filters.highlight_only = options.highlight_only;

  if (options.includeState === true) {
    // Aplicado depois dos overrides — `state` não consta em
    // RegionToAdsSearchFiltersOptions, então não há como o caller sobrescrever.
    filters.state = region.base.state;
  }

  return filters;
}
