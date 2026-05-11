import type { AdItem } from "@/lib/search/ads-search";
import type { RegionBase, RegionMember } from "@/lib/regions/fetch-region";

/**
 * Agregações regionais derivadas da amostra de anúncios da página.
 *
 * IMPORTANTE — escopo da amostra:
 *   As funções aqui operam sobre `AdItem[]` carregado pela primeira página
 *   da regional (default limit do backend, atualmente 20). Esses números
 *   representam a AMOSTRA exibida, não o estoque total. O caller é
 *   responsável por decidir quando exibir e como rotular (ex.: "top marcas
 *   nesta página"). Não chamamos isso de "top marcas da região" sem
 *   ressalva para evitar prometer contagens que não vieram do agregador
 *   correto do backend.
 *
 *   Se/quando o backend `/api/ads/search` passar a devolver `facets` com
 *   contagens agregadas para a query regional, trocar a fonte aqui para
 *   o envelope da API. A interface pública dos helpers continua a mesma.
 */

export type BrandCount = { brand: string; count: number };
export type CityCount = {
  slug: string;
  name: string;
  count: number;
  /** Quilômetros da cidade-base, quando disponível. `null` para a base. */
  distance_km: number | null;
  /** True quando é a cidade-base da região. */
  is_base: boolean;
};

const MAX_BRANDS = 5;

function normalizeBrandLabel(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Conta marcas na amostra. Retorna até MAX_BRANDS ordenadas por contagem
 * (desc) e desempate alfabético (asc) para estabilidade de SSR. Marcas
 * vazias/falsy são descartadas.
 */
export function aggregateBrandsFromAds(ads: AdItem[]): BrandCount[] {
  const counts = new Map<string, number>();
  for (const ad of ads) {
    const brand = normalizeBrandLabel(ad?.brand);
    if (!brand) continue;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  }
  const ranked: BrandCount[] = Array.from(counts.entries()).map(([brand, count]) => ({
    brand,
    count,
  }));
  ranked.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.brand.localeCompare(b.brand, "pt-BR");
  });
  return ranked.slice(0, MAX_BRANDS);
}

/**
 * Conta anúncios por cidade na amostra, sempre incluindo a cidade-base
 * primeiro (mesmo que count=0) e os membros conhecidos na ordem original
 * (proximidade já vem do backend).
 *
 * Heurística de match: comparamos `ad.city` (nome do anúncio) com o
 * nome da cidade-base e dos membros, case-insensitive e normalizando
 * acentos comuns. Não usamos slug porque o `AdItem` público não traz
 * `city_slug` — adicionar isso requereria mudar normalizeAdItem.
 *
 * Cidades dos membros que não aparecem em nenhum anúncio da amostra
 * são incluídas mesmo assim com count=0 — útil para mostrar a
 * abrangência completa da região.
 */
export function aggregateCityCountsFromAds(
  ads: AdItem[],
  base: RegionBase,
  members: RegionMember[]
): CityCount[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();

  const baseNameNorm = norm(base.name);
  const memberMap = new Map<string, RegionMember>();
  for (const m of members) memberMap.set(norm(m.name), m);

  const baseCount = { count: 0 };
  const memberCounts = new Map<string, number>();
  for (const ad of ads) {
    const cityName = typeof ad?.city === "string" ? ad.city.trim() : "";
    if (!cityName) continue;
    const cityNorm = norm(cityName);
    if (cityNorm === baseNameNorm) {
      baseCount.count += 1;
      continue;
    }
    if (memberMap.has(cityNorm)) {
      memberCounts.set(cityNorm, (memberCounts.get(cityNorm) || 0) + 1);
    }
  }

  const result: CityCount[] = [
    {
      slug: base.slug,
      name: base.name,
      count: baseCount.count,
      distance_km: null,
      is_base: true,
    },
  ];

  for (const m of members) {
    result.push({
      slug: m.slug,
      name: m.name,
      count: memberCounts.get(norm(m.name)) || 0,
      distance_km: m.distance_km,
      is_base: false,
    });
  }

  return result;
}

/**
 * Tiers comerciais usados na ordenação da vitrine regional.
 *
 * Maior valor numérico = maior prioridade. Mapeamento:
 *
 *   4 — Destaque ativo (`highlight_until` populado e não expirado)
 *   3 — Lojista Pro     (`plan` contém marcador pro/premium/master/etc.)
 *   2 — Lojista Start   (`seller_type` ou `dealership_*` indica lojista,
 *                        mas sem plan pro)
 *   1 — Grátis          (particular/sem plan)
 *
 * O backend já aplica um ranking SQL próprio com pesos semelhantes
 * (`buildSortClause` + `baseCityBoostExpr`); este reorder client-side
 * é o último passo de garantia visual no caso de o backend retornar
 * em ordem diferente (ex.: paginação por relevância antiga, cache
 * intermediário, etc.). NÃO é fonte primária de truth — é defesa.
 */
export type AdPriorityTier = 1 | 2 | 3 | 4;

function isHighlightActive(highlightUntil: string | null | undefined): boolean {
  if (!highlightUntil) return false;
  const ts = Date.parse(highlightUntil);
  if (!Number.isFinite(ts)) return false;
  return ts > Date.now();
}

const PRO_PLAN_SIGNALS = ["pro", "premium", "complete", "enterprise", "plus", "master"];

function isProPlan(plan: string | null | undefined): boolean {
  if (typeof plan !== "string") return false;
  const p = plan.toLowerCase();
  return PRO_PLAN_SIGNALS.some((sig) => p.includes(sig));
}

function isStartDealer(ad: AdItem): boolean {
  if (ad.dealership_id != null) return true;
  if (typeof ad.dealership_name === "string" && ad.dealership_name.trim()) return true;
  if (typeof ad.dealer_name === "string" && ad.dealer_name.trim()) return true;
  const sellerType = String(ad.seller_type || ad.seller_kind || ad.account_type || "")
    .toLowerCase()
    .trim();
  return sellerType === "dealer" || sellerType === "dealership" || sellerType === "store";
}

export function computeAdPriorityTier(ad: AdItem): AdPriorityTier {
  if (isHighlightActive(ad.highlight_until)) return 4;
  if (isProPlan(ad.plan)) return 3;
  if (isStartDealer(ad)) return 2;
  return 1;
}

/**
 * Ordena anúncios respeitando a regra estratégica do Carros na Cidade:
 *
 *   1. Destaque ativo
 *   2. Lojista Pro
 *   3. Lojista Start
 *   4. Grátis
 *
 * Dentro do mesmo tier comercial, prioriza proximidade da cidade-base
 * (menor distância primeiro). Anúncios da cidade-base ficam com
 * distância 0; anúncios de cidades vizinhas usam `distance_km` do
 * membership; anúncios cuja cidade não está no mapa caem para
 * `Number.POSITIVE_INFINITY` (final do grupo, sem inventar valor).
 *
 * Estabilidade: a ordem original é preservada como desempate final,
 * via `index` injetado antes do sort (Array.prototype.sort é estável
 * em Node 20+, mas mantemos `index` explícito para defesa).
 */
export function sortAdsByPriorityAndProximity(
  ads: AdItem[],
  base: RegionBase,
  members: RegionMember[]
): AdItem[] {
  if (!Array.isArray(ads) || ads.length === 0) return [];

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim();

  const cityDistance = new Map<string, number>();
  cityDistance.set(norm(base.name), 0);
  for (const m of members) {
    const key = norm(m.name);
    const d = typeof m.distance_km === "number" && Number.isFinite(m.distance_km)
      ? m.distance_km
      : Number.POSITIVE_INFINITY;
    if (!cityDistance.has(key) || d < (cityDistance.get(key) as number)) {
      cityDistance.set(key, d);
    }
  }

  const decorated = ads.map((ad, index) => ({
    ad,
    index,
    tier: computeAdPriorityTier(ad),
    distance:
      typeof ad.city === "string" && ad.city.trim()
        ? cityDistance.get(norm(ad.city)) ?? Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY,
  }));

  decorated.sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.index - b.index;
  });

  return decorated.map((d) => d.ad);
}

/**
 * Escolhe uma imagem válida do primeiro anúncio da amostra para usar como
 * OG image. Critério de "válido": uma URL string http(s) absoluta, com
 * comprimento mínimo razoável. Sem inventar URL e sem aceitar storage_key
 * cru — só URLs prontas para uso público.
 *
 * Retorna `null` se nenhum candidato passar. O caller deve então usar a
 * imagem padrão regional do site (Open Graph default herdado do layout).
 */
export function pickDynamicOgImage(ads: AdItem[]): string | null {
  for (const ad of ads) {
    const candidates: Array<string | null | undefined> = [
      ad?.image_url,
      ad?.cover_image_url,
      ad?.cover_image,
      ad?.image,
      Array.isArray(ad?.images) ? ad?.images?.[0] : null,
    ];
    for (const c of candidates) {
      if (typeof c !== "string") continue;
      const v = c.trim();
      if (!v) continue;
      if (!/^https?:\/\//i.test(v)) continue;
      if (v.length < 12) continue;
      return v;
    }
  }
  return null;
}
