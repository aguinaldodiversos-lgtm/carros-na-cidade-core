/**
 * Regras compartilhadas entre as páginas de catálogo "Comprar Estadual" e
 * "Comprar na Cidade".
 *
 * Fonte de verdade:
 *  - Estadual  => `filters.state` (UF), NUNCA `city_slug` / `city_id` / `city`
 *  - Cidade    => `filters.city_slug`, NUNCA `state` / `city_id` / `city` isolados
 *
 * Mantemos estes helpers num só lugar para evitar divergência entre rotas.
 */

import type { BuyCityContext } from "@/lib/buy/catalog-helpers";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import type { CityRef } from "@/lib/city/city-types";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import {
  buildSearchQueryString,
  DEFAULT_COMPRAR_CATALOG_LIMIT,
  mergeSearchFilters,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";

/**
 * Variantes da página /comprar.
 *
 * - `estadual`: catálogo de um UF (`/comprar/estado/[uf]`). Vitrine padrão
 *   quando o usuário não traz cidade explícita — `/comprar` redireciona
 *   para `/comprar/estado/[uf]` resolvendo a UF via cookie/default.
 * - `cidade`: catálogo de uma cidade (`/carros-em/[slug]`, canônica).
 * - `regional`: catálogo da região de uma cidade-base
 *   (`/carros-usados/regiao/[slug]`). Inclui a cidade-base + cidades
 *   próximas dentro do raio configurável; cidade-base prioriza só
 *   dentro do mesmo tier comercial (briefing 2026-05-20).
 * - `nacional`: fallback técnico do `BuyMarketplacePageClient` para empty
 *   states e telas que não têm contexto territorial. Nenhuma rota pública
 *   entra por aqui — o ponto de entrada (`/comprar`) sempre redireciona
 *   para `estadual` ou `cidade`.
 */
export type ComprarVariant = "estadual" | "cidade" | "regional" | "nacional";

export type SearchParams = Record<string, string | string[] | undefined>;

export type { BuyCityContext };

export function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function toReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      return getFirstValue(searchParams[name]);
    },
  };
}

export function normalizeUf(raw: string | null | undefined): string | null {
  const value = (raw || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return null;
  return BRAZIL_UFS.some((uf) => uf.value === value) ? value : null;
}

export function stateNameFromUf(uf: string): string {
  return BRAZIL_UFS.find((entry) => entry.value === uf)?.label ?? uf;
}

export function isValidCitySlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const parts = String(slug).trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return false;
  const uf = parts[parts.length - 1];
  return /^[a-z]{2}$/.test(uf);
}

function normalizeWord(word: string) {
  const lower = word.toLowerCase();
  const dictionary: Record<string, string> = {
    sao: "São",
    joao: "João",
    jose: "José",
    conceicao: "Conceição",
    assuncao: "Assunção",
    caxias: "Caxias",
  };
  if (dictionary[lower]) return dictionary[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function cityContextFromSlug(slug: string): BuyCityContext {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && /^[A-Z]{2}$/.test(ufCandidate));

  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map(normalizeWord)
    .join(" ");

  const name = cityName || "Cidade";
  const state = hasUf ? ufCandidate! : "SP";

  return {
    name,
    state,
    slug,
    label: `${name} (${state})`,
  };
}

export function cityContextFromRef(ref: CityRef | null | undefined): BuyCityContext | null {
  if (!ref?.slug) return null;
  return {
    name: ref.name,
    state: ref.state,
    slug: ref.slug,
    label: `${ref.name} (${ref.state})`,
  };
}

/**
 * Retorna true quando os searchParams contêm filtros de produto (brand, model,
 * q, faixa de preço etc.) — ou seja, a URL não é a vitrine canônica limpa.
 * Usado em generateMetadata para emitir robots:noindex nessas variantes,
 * evitando indexação de páginas de filtro com canonical apontando para a URL
 * limpa (o canonical só consolida; noindex é mais explícito para o crawl budget).
 */
export function hasRestrictiveFilters(filters: AdsSearchFilters): boolean {
  return Boolean(
    filters.q ||
      filters.brand ||
      filters.model ||
      filters.min_price ||
      filters.max_price ||
      filters.year_min ||
      filters.year_max ||
      filters.mileage_max ||
      filters.fuel_type ||
      filters.transmission ||
      filters.body_type ||
      filters.below_fipe === true ||
      filters.highlight_only === true
  );
}

/**
 * Normaliza filtros para o catálogo estadual:
 * - força UF;
 * - remove qualquer resquício de território de cidade;
 * - aplica defaults de sort/page/limit coerentes com /comprar.
 *
 * Default `sort="relevance"` (briefing 2026-05-20): a ordenação canônica
 * das páginas territoriais é "Mais relevantes" — combina peso comercial,
 * proximidade da cidade-base, oportunidade, abaixo da FIPE, qualidade e
 * recência. Trocar pra "recent" como default enfraqueceria a monetização
 * (Destaque/Pro perderiam topo da SERP interna).
 */
export function normalizeStateFilters(uf: string, searchParams: SearchParams): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const next: AdsSearchFilters = {
    ...parsed,
    state: uf,
    sort: hasExplicitSort ? parsed.sort || "relevance" : "relevance",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };

  delete next.city_slug;
  delete next.city_id;
  delete next.city;

  return next;
}

/**
 * Normaliza filtros para o catálogo da cidade:
 * - força city_slug;
 * - remove state/city/city_id (evita AND redundante que pode zerar resultados);
 * - default `sort="relevance"` (ver nota em `normalizeStateFilters`).
 */
export function normalizeCityFilters(
  citySlug: string,
  searchParams: SearchParams
): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const next: AdsSearchFilters = {
    ...parsed,
    city_slug: citySlug,
    sort: hasExplicitSort ? parsed.sort || "relevance" : "relevance",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };

  delete next.state;
  delete next.city;
  delete next.city_id;

  return next;
}

/** Query string só com filtros não-territoriais, para cross-links entre rotas. */
export function buildNonTerritoryQueryString(filters: AdsSearchFilters): string {
  const clone: AdsSearchFilters = { ...filters };
  delete clone.state;
  delete clone.city;
  delete clone.city_id;
  delete clone.city_slug;
  delete clone.page;
  return buildSearchQueryString(clone);
}

export function buildStatePath(uf: string, filters?: AdsSearchFilters): string {
  const base = `/comprar/estado/${uf.toLowerCase()}`;
  if (!filters) return base;
  const qs = buildNonTerritoryQueryString(filters);
  return qs ? `${base}?${qs}` : base;
}

export function buildCityPath(citySlug: string, filters?: AdsSearchFilters): string {
  const base = `/comprar/cidade/${citySlug}`;
  if (!filters) return base;
  const qs = buildNonTerritoryQueryString(filters);
  return qs ? `${base}?${qs}` : base;
}

export { mergeSearchFilters };
