// frontend/lib/buy/city-radius-sort.ts
//
// Núcleo PURO do modelo "âncora regional" (Onda 2 Fase 2a). Marco 0 km = a
// CIDADE DA PÁGINA. Regras de produto (2026-07-05):
//
//  - Ordenação ÚNICA por DISTÂNCIA CRESCENTE: cidade da página (0 km) primeiro,
//    depois vizinhas em ordem de distância, até o raio.
//  - DESTAQUES pagos têm prioridade DENTRO da mesma faixa de distância
//    (destaque antes de normal na MESMA distância), mas NUNCA furam a geografia:
//    um destaque de cidade mais distante jamais aparece antes de um anúncio de
//    cidade mais próxima. => distância é a chave PRIMÁRIA; destaque só desempata.
//  - Nada além do raio aparece (o loader já filtra os membros pelo raio; aqui,
//    ad sem distância conhecida vai para o fim).

export interface RadiusMember {
  slug: string;
  name: string;
  distance_km: number | null;
}

export interface CityDistanceInfo {
  distanceKm: number;
  name: string;
}

/** `city_slugs` da busca multi-cidade: base PRIMEIRO (boost SQL), depois membros. */
export function buildCitySlugs(baseSlug: string, members: RadiusMember[]): string[] {
  const base = String(baseSlug || "").trim();
  const out = base ? [base] : [];
  const seen = new Set(out);
  for (const m of members || []) {
    const s = m && m.slug ? String(m.slug).trim() : "";
    if (s && !seen.has(s)) {
      out.push(s);
      seen.add(s);
    }
  }
  return out;
}

/** Mapa slug → { distanceKm, name }. Base = 0 km. Distância arredondada (Haversine bruto). */
export function buildDistanceMap(
  baseSlug: string,
  baseName: string,
  members: RadiusMember[]
): Map<string, CityDistanceInfo> {
  const map = new Map<string, CityDistanceInfo>();
  if (baseSlug) map.set(String(baseSlug), { distanceKm: 0, name: baseName || "" });
  for (const m of members || []) {
    if (!m || !m.slug) continue;
    const slug = String(m.slug);
    if (map.has(slug)) continue;
    map.set(slug, { distanceKm: Math.round(Number(m.distance_km) || 0), name: m.name || "" });
  }
  return map;
}

export interface SortOptions<T> {
  distanceMap: Map<string, CityDistanceInfo>;
  getCitySlug: (ad: T) => string | null | undefined;
  getHighlight: (ad: T) => boolean;
}

/**
 * Ordena por (distância ASC, destaque DESC dentro da mesma distância, ordem
 * estável). Ad sem distância conhecida → fim. É a regra "destaque respeita a
 * geografia": nunca fura a distância.
 */
export function sortByDistanceThenHighlight<T>(ads: T[], opts: SortOptions<T>): T[] {
  const { distanceMap, getCitySlug, getHighlight } = opts;
  const distanceOf = (ad: T): number => {
    const slug = getCitySlug(ad);
    const info = slug ? distanceMap.get(String(slug)) : undefined;
    return info ? info.distanceKm : Number.POSITIVE_INFINITY;
  };
  return (Array.isArray(ads) ? ads : [])
    .map((ad, index) => ({ ad, index, dist: distanceOf(ad), hl: getHighlight(ad) ? 1 : 0 }))
    .sort((a, b) => a.dist - b.dist || b.hl - a.hl || a.index - b.index)
    .map((x) => x.ad);
}

/** Separa em "Em [cidade]" (base) e "Próximos" (vizinhas). Assume já ordenado. */
export function partitionByOrigin<T>(
  ads: T[],
  baseSlug: string,
  getCitySlug: (ad: T) => string | null | undefined
): { own: T[]; nearby: T[] } {
  const base = String(baseSlug || "").trim();
  const own: T[] = [];
  const nearby: T[] = [];
  for (const ad of Array.isArray(ads) ? ads : []) {
    if (String(getCitySlug(ad) || "").trim() === base) own.push(ad);
    else nearby.push(ad);
  }
  return { own, nearby };
}
