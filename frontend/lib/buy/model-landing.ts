/**
 * Landing SEO de cidade + marca + modelo
 * (`/cidade/[slug]/marca/[brand]/modelo/[model]`) — lógica PURA.
 *
 * A página é "catálogo normal + contexto SEO". O catálogo vem do MESMO
 * `/api/ads/search` de `/carros-em/[slug]` (Search Policy Engine): a página só
 * informa a origem (`city_slug`) e o produto (marca + modelo comercial) e
 * apresenta o que o motor devolver. Nada aqui decide território — não há raio,
 * não há lista de cidades vizinhas, não há regra regional.
 *
 * O que vive aqui (tudo testável sem rede nem React):
 *   - identidade da landing (nomes de exibição), com fallback pelos slugs;
 *   - copy (H1, lead, eyebrow, título do bloco pós-listagem);
 *   - resumo DERIVADO do estoque devolvido (nunca inventado);
 *   - URL limpa de filtros/paginação (rota dona de cidade/marca/modelo);
 *   - breadcrumb e links de exploração.
 */

import type { AdsSearchFilters, AdsSearchResponse } from "@/lib/search/ads-search";
import type { TerritorialListingFilters } from "@/lib/search/territorial-public";
import { buildNonTerritoryQueryString, getFirstValue, toReader } from "@/lib/buy/territory-variant";
import {
  DEFAULT_COMPRAR_CATALOG_LIMIT,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";
import { readOfferCounts, readSearchPolicy } from "@/lib/search/search-policy";
import { formatPricePublic } from "@/lib/public-contracts";
import { canonicalBrandLabel, canonicalBrandSlug } from "@/lib/seo/brand-model-slug";
import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";
import { decideSeoQueryPolicy } from "@/lib/seo/query-policy";

export type ModelLandingSearchParams = Record<string, string | string[] | undefined>;

export interface ModelLandingIdentity {
  citySlug: string;
  cityName: string;
  /** UF em maiúsculas; `""` quando desconhecida (nunca inventada). */
  cityState: string;
  brandSlug: string;
  brandName: string;
  modelSlug: string;
  modelName: string;
}

/** Caminho canônico da landing — mesmo formato do backend e do sitemap. */
export function modelLandingPath(
  identity: Pick<ModelLandingIdentity, "citySlug" | "brandSlug" | "modelSlug">
): string {
  return `/cidade/${identity.citySlug}/marca/${identity.brandSlug}/modelo/${identity.modelSlug}`;
}

function titleizeSlug(slug: string): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** `"atibaia-sp"` → `"SP"`; `""` sem sufixo de UF. */
function ufFromCitySlug(slug: string): string {
  const last =
    String(slug || "")
      .split("-")
      .filter(Boolean)
      .pop() || "";
  return /^[a-z]{2}$/i.test(last) ? last.toUpperCase() : "";
}

/** `"braganca-paulista-sp"` → `"Braganca Paulista"` (fallback sem acento). */
function cityNameFromSlug(slug: string): string {
  const parts = String(slug || "")
    .split("-")
    .filter(Boolean);
  const hasUf = parts.length > 1 && /^[a-z]{2}$/i.test(parts[parts.length - 1]);
  return titleizeSlug((hasUf ? parts.slice(0, -1) : parts).join("-"));
}

/**
 * Nomes de exibição da landing. O payload territorial é a fonte (rótulos
 * reais: "Bragança Paulista", "Chevrolet", "T-Cross"); os slugs da rota só
 * entram quando o backend não respondeu — a página continua coerente com a
 * URL em vez de mostrar "Carros na Cidade" genérico.
 */
export function resolveModelLandingIdentity(
  payload: {
    city?: { name?: string | null; state?: string | null; slug?: string | null } | null;
    brand?: { name?: string | null; slug?: string | null } | null;
    model?: { name?: string | null; slug?: string | null } | null;
  },
  route: { slug: string; brand: string; model: string }
): ModelLandingIdentity {
  const citySlug = String(payload.city?.slug || route.slug).trim();
  const brandSlug = String(
    payload.brand?.slug || canonicalBrandSlug(route.brand) || route.brand
  ).trim();
  const modelSlug = String(payload.model?.slug || route.model).trim();

  return {
    citySlug,
    cityName: String(payload.city?.name || "").trim() || cityNameFromSlug(citySlug),
    cityState:
      String(payload.city?.state || "")
        .trim()
        .toUpperCase() || ufFromCitySlug(citySlug),
    brandSlug,
    brandName:
      String(payload.brand?.name || "").trim() || canonicalBrandLabel(titleizeSlug(brandSlug)),
    modelSlug,
    modelName: String(payload.model?.name || "").trim() || titleizeSlug(modelSlug),
  };
}

export interface ModelLandingCopy {
  /** "Atibaia - SP" */
  cityLabel: string;
  /** "Carros na Cidade · Atibaia (SP)" */
  eyebrow: string;
  /** "Chevrolet Onix em Atibaia - SP" — o ÚNICO h1 da página. */
  h1: string;
  /** Descrição curta logo abaixo do H1. */
  lead: string;
  /** Título do bloco pós-listagem: "Chevrolet Onix disponíveis em Atibaia". */
  inventoryHeading: string;
  /** Title/description de fallback quando o backend não mandou `seo`. */
  fallbackTitle: string;
  fallbackDescription: string;
}

export function buildModelLandingCopy(identity: ModelLandingIdentity): ModelLandingCopy {
  const { cityName, cityState, brandName, modelName } = identity;
  const vehicle = `${brandName} ${modelName}`.trim();
  const cityLabel = cityState ? `${cityName} - ${cityState}` : cityName;

  return {
    cityLabel,
    eyebrow: cityState
      ? `Carros na Cidade · ${cityName} (${cityState})`
      : `Carros na Cidade · ${cityName}`,
    h1: `${vehicle} em ${cityLabel}`,
    lead: `Encontre ${vehicle} usados e seminovos à venda em ${cityName}. Compare preços, ano, quilometragem e ofertas em relação à Tabela FIPE.`,
    inventoryHeading: `${vehicle} disponíveis em ${cityName}`,
    fallbackTitle: `Comprar ${vehicle} em ${cityLabel}`,
    fallbackDescription: `${vehicle} usados e seminovos à venda em ${cityLabel}. Compare preços, ano, quilometragem e ofertas em relação à Tabela FIPE.`,
  };
}

/* ------------------------------------------------------------------------ */
/* Resumo do estoque                                                         */
/* ------------------------------------------------------------------------ */

export interface ModelLandingSummary {
  /** Total do motor (todas as páginas). Sempre confiável. */
  total: number;
  /** Abaixo da FIPE no conjunto inteiro; `null` quando ninguém contou. */
  belowFipe: number | null;
  /**
   * Faixas exatas. Só existem quando o conjunto INTEIRO está nesta resposta
   * (página 1 com todos os anúncios): a faixa de preço de uma página parcial
   * seria um número verdadeiro sobre a coisa errada. Sem certeza, `null` — e o
   * componente simplesmente não mostra o indicador.
   */
  minPrice: number | null;
  maxPrice: number | null;
  minYear: number | null;
  maxYear: number | null;
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resumo derivado dos resultados REAIS devolvidos pelo motor. `null` quando não
 * há anúncio — a página então não exibe indicadores nem bloco de estoque.
 */
export function summarizeModelListing(
  results: AdsSearchResponse | null | undefined
): ModelLandingSummary | null {
  const items = Array.isArray(results?.data) ? results.data : [];
  const total = Math.max(0, Number(results?.pagination?.total) || 0);
  if (total <= 0 || items.length === 0) return null;

  const page = Number(results?.pagination?.page) || 1;
  const complete = page === 1 && items.length >= total;

  if (!complete) {
    // Página parcial: só o que o motor contou sobre o conjunto todo.
    const offers = readOfferCounts(results?.engine_offer_counts);
    return {
      total,
      belowFipe: offers ? offers.below_fipe : null,
      minPrice: null,
      maxPrice: null,
      minYear: null,
      maxYear: null,
    };
  }

  const prices = items
    .map((item) => positiveNumber(item.price))
    .filter((n): n is number => n !== null);
  const years = items
    .map((item) => positiveNumber(item.year))
    .filter((n): n is number => n !== null && n >= 1900 && n <= 2100);

  return {
    total,
    belowFipe: items.filter((item) => item.below_fipe === true).length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minYear: years.length ? Math.min(...years) : null,
    maxYear: years.length ? Math.max(...years) : null,
  };
}

/** "R$ 63.900 – R$ 78.900" · "R$ 72.500" · `null`. */
export function formatPriceRange(min: number | null, max: number | null): string | null {
  const lo = min !== null ? formatPricePublic(min, { whenAbsent: "null" }) : null;
  const hi = max !== null ? formatPricePublic(max, { whenAbsent: "null" }) : null;
  if (!lo || !hi) return lo || hi || null;
  return min === max ? lo : `${lo} – ${hi}`;
}

/** "2021 a 2025" · "2024" · `null`. */
export function formatYearRange(min: number | null, max: number | null): string | null {
  if (min === null || max === null)
    return min !== null ? String(min) : max !== null ? String(max) : null;
  return min === max ? String(min) : `${min} a ${max}`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${new Intl.NumberFormat("pt-BR").format(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Frase do bloco pós-listagem, montada SÓ com o que o resumo sustenta:
 *   "6 veículos anunciados, sendo 2 abaixo da FIPE. Preços entre R$ 63.900 e
 *    R$ 78.900, com anos de 2021 a 2025."
 * Cada trecho some quando o dado correspondente não existe.
 */
export function buildInventorySentence(summary: ModelLandingSummary): string {
  let first = pluralize(summary.total, "veículo anunciado", "veículos anunciados");
  if (summary.belowFipe) {
    first += `, sendo ${new Intl.NumberFormat("pt-BR").format(summary.belowFipe)} abaixo da FIPE`;
  }

  const parts = [`${first}.`];

  const lo =
    summary.minPrice !== null ? formatPricePublic(summary.minPrice, { whenAbsent: "null" }) : null;
  const hi =
    summary.maxPrice !== null ? formatPricePublic(summary.maxPrice, { whenAbsent: "null" }) : null;
  let second = "";
  if (lo && hi) second = lo === hi ? `Preço de ${lo}` : `Preços entre ${lo} e ${hi}`;

  const years = formatYearRange(summary.minYear, summary.maxYear);
  if (years) {
    const yearText = summary.minYear === summary.maxYear ? `ano ${years}` : `anos de ${years}`;
    second = second ? `${second}, com ${yearText}` : `Modelos com ${yearText}`;
  }
  if (second) parts.push(`${second}.`);

  return parts.join(" ");
}

/**
 * O conjunto tem anúncios de outras cidades? Lido do bloco `search_policy`
 * (cidades do território com candidato) e, no caminho legado, da distância
 * dos próprios anúncios. Serve só para a frase discreta "Resultados em X e
 * cidades próximas" — o raio, o piso e o nome das regras ficam de fora da UX.
 */
export function hasRegionalResults(results: AdsSearchResponse | null | undefined): boolean {
  const policy = readSearchPolicy(results?.search_policy);
  const originSlug = policy?.origin_city?.slug;
  if (policy && originSlug) {
    if (policy.cities.some((city) => city.slug !== originSlug && (city.count ?? 0) > 0))
      return true;
  }
  const items = Array.isArray(results?.data) ? results.data : [];
  return items.some((item) => typeof item.distance_km === "number" && item.distance_km > 0);
}

/* ------------------------------------------------------------------------ */
/* Filtros e URL                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Chaves que pertencem à ROTA, não ao visitante. Na landing elas vivem no
 * path (cidade, marca, modelo); se aparecerem na query são resquício de URL
 * antiga e não podem nem filtrar nem ser reemitidas nos links.
 */
const ROUTE_OWNED_KEYS = [
  "city",
  "city_id",
  "city_slug",
  "city_slugs",
  "state",
  "brand",
  "model",
  "commercial_model",
] as const satisfies ReadonlyArray<keyof AdsSearchFilters>;

/**
 * Filtros do VISITANTE lidos da query (preço, ano, km, câmbio, ordenação,
 * página, raio…). Mesmos defaults da vitrine de cidade.
 */
export function parseModelLandingFilters(
  searchParams: ModelLandingSearchParams = {}
): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));
  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const next: AdsSearchFilters = {
    ...parsed,
    sort: hasExplicitSort ? parsed.sort || "relevance" : "relevance",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };
  for (const key of ROUTE_OWNED_KEYS) delete next[key];
  return next;
}

/**
 * Pedido completo ao `/api/ads/search`: filtros do visitante + origem da rota
 * + produto resolvido pelo backend. O território é SÓ `city_slug` — o motor
 * trata como origem de página de cidade e decide o resto.
 */
export function buildModelListingRequest(
  userFilters: AdsSearchFilters,
  citySlug: string,
  listing: TerritorialListingFilters
): AdsSearchFilters {
  const request: AdsSearchFilters = { ...userFilters, city_slug: citySlug, brand: listing.brand };
  if (listing.commercial_model) request.commercial_model = listing.commercial_model;
  else if (listing.model) request.model = listing.model;
  return request;
}

/**
 * Query LIMPA da landing: sem chaves da rota, sem `limit`, sem `page=1`, sem
 * `sort=relevance`. Passa pela política central (`decideSeoQueryPolicy`), a
 * mesma do middleware — então o link gerado aqui nunca é redirecionado.
 */
export function buildModelLandingQuery(filters: AdsSearchFilters, page = 1): string {
  const clone: AdsSearchFilters = { ...filters };
  for (const key of ROUTE_OWNED_KEYS) delete clone[key];
  const params = new URLSearchParams(buildNonTerritoryQueryString(clone));
  if (page >= 2) params.set("page", String(Math.trunc(page)));
  return decideSeoQueryPolicy(params).normalizedQuery;
}

export function buildModelLandingHref(
  pathname: string,
  filters: AdsSearchFilters,
  page = 1
): string {
  const query = buildModelLandingQuery(filters, page);
  return query ? `${pathname}?${query}` : pathname;
}

/** Quantos recortes o VISITANTE aplicou (ordenação e página não contam). */
export function countActiveUserFilters(filters: AdsSearchFilters): number {
  let count = 0;
  if (filters.q) count += 1;
  if (filters.min_price !== undefined || filters.max_price !== undefined) count += 1;
  if (filters.year_min !== undefined || filters.year_max !== undefined) count += 1;
  if (filters.mileage_max !== undefined) count += 1;
  if (filters.fuel_type) count += 1;
  if (filters.transmission) count += 1;
  if (filters.body_type) count += 1;
  if (filters.below_fipe === true) count += 1;
  if (filters.highlight_only === true) count += 1;
  if (filters.opportunity === true) count += 1;
  if (filters.seller_kind === "dealer" || filters.seller_kind === "private") count += 1;
  if (filters.priority_tier) count += 1;
  if (typeof filters.raio === "number") count += 1;
  return count;
}

/* ------------------------------------------------------------------------ */
/* Navegação                                                                 */
/* ------------------------------------------------------------------------ */

export interface ModelLandingLink {
  label: string;
  href: string;
}

/**
 * Home › Carros em {cidade} › {Marca} › {Modelo}. O último item carrega o
 * próprio caminho para o BreadcrumbList; visualmente é o item corrente.
 */
export function buildModelLandingBreadcrumbs(identity: ModelLandingIdentity): ModelLandingLink[] {
  const cityPath = getCanonicalCityPath(identity.citySlug) ?? `/cidade/${identity.citySlug}`;
  return [
    { label: "Home", href: "/" },
    { label: `Carros em ${identity.cityName}`, href: cityPath },
    { label: identity.brandName, href: `/cidade/${identity.citySlug}/marca/${identity.brandSlug}` },
    { label: identity.modelName, href: modelLandingPath(identity) },
  ];
}

/**
 * "Explorar em {cidade}" — os MESMOS quatro destinos que a página já linkava
 * (hub territorial, abaixo da FIPE, marca e catálogo da cidade), agora como
 * bloco próprio. `<a href>` de verdade: é navegação para o crawler também.
 */
export function buildModelLandingExploreLinks(identity: ModelLandingIdentity): ModelLandingLink[] {
  const base = `/cidade/${identity.citySlug}`;
  const catalogPath = getCanonicalCityPath(identity.citySlug);
  const links: ModelLandingLink[] = [
    { label: `Todos os carros em ${identity.cityName}`, href: base },
    { label: "Carros abaixo da FIPE", href: `${base}/abaixo-da-fipe` },
    {
      label: `${identity.brandName} em ${identity.cityName}`,
      href: `${base}/marca/${identity.brandSlug}`,
    },
  ];
  if (catalogPath)
    links.push({ label: `Catálogo completo em ${identity.cityName}`, href: catalogPath });
  return links;
}

export interface ModelLandingBrandLink {
  brand: string;
  total: number;
  href: string;
}

/**
 * "Marcas populares" da cidade como LINKS para as landings de marca — só as
 * que qualificam para indexação (`minAds`). Entidade abaixo do limiar não vira
 * âncora (regra da Fase 3): linkar para página magra `noindex` só gasta
 * rastreamento. As grafias de grupo FIPE se somam ("VW - VolksWagen" +
 * "Volkswagen" = uma marca).
 */
export function buildPopularBrandLinks(
  facets: Array<{ brand: string; total: number }> | undefined,
  citySlug: string,
  minAds: number,
  limit = 8
): ModelLandingBrandLink[] {
  const bySlug = new Map<string, ModelLandingBrandLink>();
  for (const facet of facets || []) {
    const slug = canonicalBrandSlug(facet?.brand);
    const total = Math.max(0, Number(facet?.total) || 0);
    if (!slug || total <= 0) continue;
    const current = bySlug.get(slug);
    if (current) current.total += total;
    else
      bySlug.set(slug, {
        brand: canonicalBrandLabel(facet.brand),
        total,
        href: `/cidade/${citySlug}/marca/${slug}`,
      });
  }
  return [...bySlug.values()]
    .filter((item) => item.total >= Math.max(1, minAds))
    .sort((a, b) => b.total - a.total || a.brand.localeCompare(b.brand, "pt-BR"))
    .slice(0, limit);
}
