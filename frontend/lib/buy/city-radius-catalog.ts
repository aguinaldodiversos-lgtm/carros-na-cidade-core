import "server-only";

import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { fetchAdsSearch, type AdItem } from "@/lib/search/ads-search";
import { getRegionalRadiusKm } from "@/lib/buy/regional-radius-config";
import { sortByDistanceThenHighlight, type CityDistanceInfo } from "@/lib/buy/city-radius-sort";

/**
 * Loader da seção "Próximos, até X km" da página de cidade (âncora regional,
 * Onda 2 Fase 2a). Marco 0 km = a cidade da página; aqui trazemos SÓ as
 * vizinhas (a cidade própria fica no catálogo principal = bloco "Em [cidade]").
 *
 * Ordenação: distância crescente; destaque só desempata DENTRO da mesma
 * distância (nunca fura a geografia). Cada card carrega procedência + distância.
 * Como `AdItem` não tem `city_slug`, casamos o anúncio à cidade-membro pela
 * chave normalizada nome|UF.
 */

export interface RadiusCoverageMember {
  slug: string;
  name: string;
  state: string;
  distance_km: number | null;
}

interface RadiusCoverage {
  citySlug: string;
  radiusKm: number;
  ownCount: number;
  indexable: boolean;
  members: RadiusCoverageMember[];
}

export interface NearbyAd {
  ad: AdItem;
  originCity: string;
  originState: string;
  distanceKm: number | null;
}

export interface NearbyRadiusResult {
  radiusKm: number;
  coverageCities: Array<{ name: string; state: string; distanceKm: number }>;
  nearby: NearbyAd[];
}

const EMPTY: NearbyRadiusResult = { radiusKm: getRegionalRadiusKm(), coverageCities: [], nearby: [] };

/** normaliza nome de cidade + UF numa chave estável (NFD strip, lower). */
function cityKey(name?: string | null, state?: string | null): string {
  const n = String(name ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const s = String(state ?? "")
    .trim()
    .toUpperCase();
  return `${n}|${s}`;
}

function isHighlighted(ad: AdItem): boolean {
  if (ad.priority_tier === 4) return true;
  if (ad.highlight_until) {
    const ts = new Date(ad.highlight_until).getTime();
    return Number.isFinite(ts) && ts > Date.now();
  }
  return false;
}

async function fetchCityRadiusCoverage(citySlug: string): Promise<RadiusCoverage | null> {
  const url = resolveInternalBackendApiUrl(
    `/api/public/cities/${encodeURIComponent(citySlug)}/radius`
  );
  if (!url) return null;
  try {
    const res = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: "city-radius",
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: RadiusCoverage };
    if (!json?.success || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Carrega os anúncios das cidades vizinhas dentro do raio, ordenados por
 * distância (destaque só desempata). Degrada para vazio em qualquer falha.
 */
export async function loadNearbyRadiusAds(
  citySlug: string,
  options: { limit?: number } = {}
): Promise<NearbyRadiusResult> {
  const safeSlug = String(citySlug || "").trim();
  if (!safeSlug) return EMPTY;

  const coverage = await fetchCityRadiusCoverage(safeSlug);
  if (!coverage || !Array.isArray(coverage.members) || coverage.members.length === 0) {
    return { ...EMPTY, radiusKm: coverage?.radiusKm ?? getRegionalRadiusKm() };
  }

  const memberSlugs = coverage.members.map((m) => m.slug).filter(Boolean);
  if (memberSlugs.length === 0) return { ...EMPTY, radiusKm: coverage.radiusKm };

  // Mapa chave(nome|UF) → distância (o anúncio só tem nome de cidade + UF).
  const distanceMap = new Map<string, CityDistanceInfo>();
  const coverageCities: NearbyRadiusResult["coverageCities"] = [];
  for (const m of coverage.members) {
    const km = Math.round(Number(m.distance_km) || 0);
    distanceMap.set(cityKey(m.name, m.state), { distanceKm: km, name: m.name });
    coverageCities.push({ name: m.name, state: m.state, distanceKm: km });
  }

  let ads: AdItem[] = [];
  try {
    const res = await fetchAdsSearch({
      city_slugs: memberSlugs,
      sort: "relevance",
      page: 1,
      limit: options.limit ?? 24,
    });
    ads = (res?.data || []).filter(hasRealPrice);
  } catch {
    ads = [];
  }
  if (ads.length === 0) return { radiusKm: coverage.radiusKm, coverageCities, nearby: [] };

  const sorted = sortByDistanceThenHighlight(ads, {
    distanceMap,
    getCitySlug: (ad) => cityKey(ad.city, ad.state),
    getHighlight: isHighlighted,
  });

  const nearby: NearbyAd[] = sorted.map((ad) => {
    const info = distanceMap.get(cityKey(ad.city, ad.state));
    return {
      ad,
      originCity: String(ad.city ?? "").trim(),
      originState: String(ad.state ?? "").trim(),
      distanceKm: info ? info.distanceKm : null,
    };
  });

  return { radiusKm: coverage.radiusKm, coverageCities, nearby };
}
