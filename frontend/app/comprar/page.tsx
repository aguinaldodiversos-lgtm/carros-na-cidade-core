import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import type { CityRef } from "@/lib/city/city-types";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { fetchAdsFacets, fetchAdsSearch } from "@/lib/search/ads-search";
import { fetchCatalogAdsTerritoryFallback } from "@/lib/search/catalog-ads-territory-fallback";
import { isComprarTerritoryOnlyFilters } from "@/lib/search/comprar-territory";
import {
  buildSearchQueryString,
  DEFAULT_COMPRAR_CATALOG_LIMIT,
  mergeSearchFilters,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";

type SearchParams = Record<string, string | string[] | undefined>;

type ComprarPageProps = {
  searchParams?: SearchParams;
};

export const revalidate = 60;

type CityContext = {
  name: string;
  state: string;
  slug: string;
  label: string;
};

function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      return getFirstValue(searchParams[name]);
    },
  };
}

function normalizeWord(word: string) {
  const lower = word.toLowerCase();

  const dictionary: Record<string, string> = {
    sao: "São",
    joao: "João",
    jose: "José",
    conceicao: "Conceição",
  };

  if (dictionary[lower]) return dictionary[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function cityFromSlug(slug: string): CityContext {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);

  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map(normalizeWord)
    .join(" ");

  const name = cityName || "São Paulo";
  const state = hasUf ? ufCandidate! : "SP";

  return {
    name,
    state,
    slug,
    label: `${name} - ${state}`,
  };
}

function cityFromText(city?: string, state?: string): CityContext {
  const normalizedCity = (city || "São Paulo").trim();
  const normalizedState = (state || "SP").trim().toUpperCase();

  return {
    name: normalizedCity,
    state: normalizedState,
    slug: `${normalizedCity}-${normalizedState}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-"),
    label: `${normalizedCity} - ${normalizedState}`,
  };
}

/**
 * Em /comprar, não forçar mais um território padrão global.
 *
 * Prioridade:
 * 1. city_slug explícito na URL
 * 2. city_id explícito na URL (legado)
 * 3. city/state explícitos na URL (legado)
 * 4. sem território => busca aberta
 *
 * O cookie continua útil para contexto visual quando compatível,
 * mas não deve zerar a listagem por impor uma cidade padrão.
 */
function normalizeBuyFilters(
  searchParams: SearchParams = {},
  _cookieCity?: CityRef | null
): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const explicitSlug = parsed.city_slug?.trim();
  const hasIdOnly =
    !explicitSlug && parsed.city_id != null && Number.isFinite(Number(parsed.city_id));

  const hasLegacyCityText = Boolean(parsed.city?.trim() || parsed.state?.trim());

  /**
   * parseAdsSearchFiltersFromSearchParams injeta sort=relevance quando ausente;
   * em /comprar, o default desejado é recent.
   */
  const sortInQuery = getFirstValue(searchParams.sort);
  const hasExplicitSort = sortInQuery != null && String(sortInQuery).trim() !== "";

  const merged: AdsSearchFilters = {
    ...parsed,
    sort: hasExplicitSort ? parsed.sort || "recent" : "recent",
    page: parsed.page || 1,
    limit: parsed.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
  };

  if (explicitSlug) {
    merged.city_slug = explicitSlug;
    delete merged.city_id;
    delete merged.city;
    delete merged.state;
    return merged;
  }

  if (hasIdOnly) {
    merged.city_id = parsed.city_id;
    delete merged.city_slug;
    delete merged.city;
    delete merged.state;
    return merged;
  }

  if (hasLegacyCityText) {
    delete merged.city_slug;
    delete merged.city_id;
    merged.city = parsed.city;
    merged.state = parsed.state;
    return merged;
  }

  /**
   * Busca aberta: não injeta city_slug padrão.
   */
  delete merged.city_slug;
  delete merged.city_id;
  delete merged.city;
  delete merged.state;

  return merged;
}

function resolveCity(filters: AdsSearchFilters, cookieCity?: CityRef | null): CityContext {
  if (filters.city_slug) {
    return cityFromSlug(filters.city_slug);
  }

  if (filters.city_id != null && cookieCity?.id === filters.city_id) {
    return cityFromSlug(cookieCity.slug);
  }

  if (filters.city?.trim() || filters.state?.trim()) {
    return cityFromText(filters.city, filters.state);
  }

  if (cookieCity?.slug) {
    return cityFromSlug(cookieCity.slug);
  }

  return cityFromText("São Paulo", "SP");
}

function buildEmptyResults(filters: AdsSearchFilters): AdsSearchResponse {
  return {
    success: false,
    ok: false,
    data: [],
    pagination: {
      page: filters.page || 1,
      limit: filters.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT,
      total: 0,
      totalPages: 1,
    },
    error: null,
  };
}

function buildEmptyFacets(): AdsFacetsResponse["facets"] {
  return {
    brands: [],
    models: [],
    fuelTypes: [],
    bodyTypes: [],
  };
}

function isValidResultsResponse(value: unknown): value is AdsSearchResponse {
  if (!value || typeof value !== "object") return false;

  const response = value as AdsSearchResponse;

  return (
    Array.isArray(response.data) &&
    Boolean(response.pagination) &&
    typeof response.pagination.page === "number" &&
    typeof response.pagination.limit === "number" &&
    typeof response.pagination.total === "number" &&
    typeof response.pagination.totalPages === "number"
  );
}

function isValidFacetsResponse(value: unknown): value is AdsFacetsResponse {
  if (!value || typeof value !== "object") return false;

  const response = value as AdsFacetsResponse;

  return (
    Boolean(response.facets) &&
    Array.isArray(response.facets.brands) &&
    Array.isArray(response.facets.models) &&
    Array.isArray(response.facets.fuelTypes) &&
    Array.isArray(response.facets.bodyTypes)
  );
}

function buildMetadataTitle(filters: AdsSearchFilters, city: CityContext) {
  if (filters.brand && filters.model) {
    return `${filters.brand} ${filters.model} em ${city.name} | Comprar`;
  }

  if (filters.brand) {
    return `${filters.brand} em ${city.name} | Comprar`;
  }

  if (filters.city_slug || filters.city || filters.city_id != null) {
    return `Carros usados e seminovos em ${city.name} | Comprar`;
  }

  return "Carros usados e seminovos | Comprar";
}

function buildMetadataDescription(filters: AdsSearchFilters, city: CityContext) {
  if (filters.brand && filters.model) {
    return `${filters.brand} ${filters.model} em ${city.name} (${city.state}): catálogo regional com filtros por cidade, anúncios com contexto local e oportunidades no Carros na Cidade.`;
  }

  if (filters.brand) {
    return `Carros ${filters.brand} em ${city.name}: listagem focada no seu território, com filtros rápidos e ofertas reais na região — Carros na Cidade.`;
  }

  if (filters.city_slug || filters.city || filters.city_id != null) {
    return `Usados e seminovos em ${city.name} (${city.state}): marketplace regional onde cada anúncio nasce na cidade — compare preços e negocie com contexto local no Carros na Cidade.`;
  }

  return "Usados e seminovos em várias cidades: compare preços, filtre por marca, modelo e versão e encontre anúncios reais no Carros na Cidade.";
}

export async function generateMetadata({
  searchParams = {},
}: ComprarPageProps): Promise<Metadata> {
  const cookieStore = await cookies();
  const cookieCity = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const filters = normalizeBuyFilters(searchParams, cookieCity);
  const city = resolveCity(filters, cookieCity);

  const title = buildMetadataTitle(filters, city);
  const description = buildMetadataDescription(filters, city);
  const canonicalQs = buildSearchQueryString(filters);
  const canonicalPath = canonicalQs ? `/comprar?${canonicalQs}` : "/comprar";

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function ComprarPage({ searchParams = {} }: ComprarPageProps) {
  const cookieStore = await cookies();
  const cookieCity = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const filters = normalizeBuyFilters(searchParams, cookieCity);
  const city = resolveCity(filters, cookieCity);

  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  const initialResults =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  const initialFacets =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  /**
   * Se houver filtros puramente territoriais com city_slug e a cidade não tiver estoque,
   * tenta fallback para outra cidade com anúncios.
   * Em busca aberta (sem city_slug), não redireciona.
   */
  if (
    filters.city_slug &&
    isComprarTerritoryOnlyFilters(filters) &&
    initialResults.pagination.total === 0
  ) {
    const territory = await fetchCatalogAdsTerritoryFallback(filters.city_slug);

    if (territory?.mode === "fallback" && territory.slug && territory.slug !== filters.city_slug) {
      const merged = mergeSearchFilters(filters, { city_slug: territory.slug, page: 1 });
      const qs = buildSearchQueryString(merged);
      redirect(qs ? `/comprar?${qs}` : "/comprar");
    }
  }

  return (
    <BuyMarketplacePageClient
      initialResults={initialResults}
      initialFacets={initialFacets}
      initialFilters={filters}
      city={city}
    />
  );
}
