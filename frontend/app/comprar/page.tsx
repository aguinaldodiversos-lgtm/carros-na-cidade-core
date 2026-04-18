import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import type { CityRef } from "@/lib/city/city-types";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { toAbsoluteUrl } from "@/lib/seo/site";
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
import { getPublicDefaultCity } from "@/lib/site/public-config";

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

type TerritoryResolution = {
  filters: AdsSearchFilters;
  city: CityContext;
  source: "explicit" | "preferred" | "open";
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

function cityFromRef(city?: CityRef | null): CityContext | null {
  if (!city?.slug) return null;
  return {
    name: city.name,
    state: city.state,
    slug: city.slug,
    label: `${city.name} - ${city.state}`,
  };
}

function getPublicDefaultCityContext(): CityContext {
  const publicCity = getPublicDefaultCity();
  return {
    name: publicCity.name,
    state: publicCity.state,
    slug: publicCity.slug,
    label: `${publicCity.name} - ${publicCity.state}`,
  };
}

function hasExplicitTerritoryInSearchParams(searchParams: SearchParams): boolean {
  const citySlug = getFirstValue(searchParams.city_slug)?.trim();
  const cityId = getFirstValue(searchParams.city_id)?.trim();
  const city = getFirstValue(searchParams.city)?.trim();
  const state = getFirstValue(searchParams.state)?.trim();

  return Boolean(citySlug || cityId || city || state);
}

/**
 * Em /comprar:
 * - território explícito na URL = obrigatório
 * - sem território explícito = catálogo aberto por padrão no filtro
 *
 * O comportamento regional por padrão é resolvido depois, no nível da busca:
 * tenta cidade preferencial primeiro, e só abre o catálogo se essa cidade não tiver estoque.
 */
function normalizeBuyFilters(searchParams: SearchParams = {}): AdsSearchFilters {
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
   * Sem território explícito => não injeta cidade no filtro.
   * A preferência regional será aplicada em fase posterior, com fallback inteligente.
   */
  delete merged.city_slug;
  delete merged.city_id;
  delete merged.city;
  delete merged.state;

  return merged;
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

function buildMetadataTitle(
  filters: AdsSearchFilters,
  city: CityContext,
  hasExplicitTerritory: boolean
) {
  if (filters.brand && filters.model) {
    return `${filters.brand} ${filters.model} em ${city.name} | Comprar`;
  }

  if (filters.brand) {
    return `${filters.brand} em ${city.name} | Comprar`;
  }

  if (hasExplicitTerritory) {
    return `Carros usados e seminovos em ${city.name} | Comprar`;
  }

  return "Carros usados e seminovos por cidade | Comprar";
}

function buildMetadataDescription(
  filters: AdsSearchFilters,
  city: CityContext,
  hasExplicitTerritory: boolean
) {
  if (filters.brand && filters.model) {
    return `${filters.brand} ${filters.model} em ${city.name} (${city.state}): catálogo regional com filtros por cidade, anúncios com contexto local e oportunidades no Carros na Cidade.`;
  }

  if (filters.brand) {
    return `Carros ${filters.brand} em ${city.name}: listagem focada no seu território, com filtros rápidos e ofertas reais na região — Carros na Cidade.`;
  }

  if (hasExplicitTerritory) {
    return `Usados e seminovos em ${city.name} (${city.state}): marketplace regional onde cada anúncio nasce na cidade — compare preços e negocie com contexto local no Carros na Cidade.`;
  }

  return "Catálogo automotivo regional com anúncios reais por cidade, filtros inteligentes e navegação territorial no Carros na Cidade.";
}

async function resolveComprarData(params: {
  filters: AdsSearchFilters;
  hasExplicitTerritory: boolean;
  cookieCity?: CityRef | null;
}) {
  const { filters, hasExplicitTerritory, cookieCity } = params;

  const publicDefaultCity = getPublicDefaultCityContext();
  const preferredCity = cityFromRef(cookieCity) || publicDefaultCity;

  /**
   * Se o território foi explicitamente pedido pelo utilizador, respeitamos.
   */
  if (hasExplicitTerritory) {
    const explicitCity = filters.city_slug
      ? cityFromSlug(filters.city_slug)
      : filters.city?.trim() || filters.state?.trim()
        ? cityFromText(filters.city, filters.state)
        : preferredCity;

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

    return {
      filters,
      city: explicitCity,
      source: "explicit" as const,
      initialResults,
      initialFacets,
    };
  }

  /**
   * Sem território explícito:
   * 1. tenta a cidade preferencial (cookie > default público)
   * 2. se não houver estoque, cai para catálogo aberto
   */
  const preferredFilters = mergeSearchFilters(filters, {
    city_slug: preferredCity.slug,
    page: 1,
  });

  const [preferredResultsResponse, preferredFacetsResponse] = await Promise.allSettled([
    fetchAdsSearch(preferredFilters),
    fetchAdsFacets(preferredFilters),
  ]);

  const preferredResults =
    preferredResultsResponse.status === "fulfilled" &&
    isValidResultsResponse(preferredResultsResponse.value)
      ? preferredResultsResponse.value
      : buildEmptyResults(preferredFilters);

  const preferredFacets =
    preferredFacetsResponse.status === "fulfilled" &&
    isValidFacetsResponse(preferredFacetsResponse.value)
      ? preferredFacetsResponse.value.facets
      : buildEmptyFacets();

  if (preferredResults.pagination.total > 0) {
    return {
      filters: preferredFilters,
      city: preferredCity,
      source: "preferred" as const,
      initialResults: preferredResults,
      initialFacets: preferredFacets,
    };
  }

  /**
   * Fallback sem território obrigatório:
   * mantém o contexto regional do portal, mas não zera a vitrine.
   */
  const [openResultsResponse, openFacetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  const openResults =
    openResultsResponse.status === "fulfilled" && isValidResultsResponse(openResultsResponse.value)
      ? openResultsResponse.value
      : buildEmptyResults(filters);

  const openFacets =
    openFacetsResponse.status === "fulfilled" && isValidFacetsResponse(openFacetsResponse.value)
      ? openFacetsResponse.value.facets
      : buildEmptyFacets();

  return {
    filters,
    city: preferredCity,
    source: "open" as const,
    initialResults: openResults,
    initialFacets: openFacets,
  };
}

export async function generateMetadata({
  searchParams = {},
}: ComprarPageProps): Promise<Metadata> {
  const cookieStore = await cookies();
  const cookieCity = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);

  const filters = normalizeBuyFilters(searchParams);
  const hasExplicitTerritory = hasExplicitTerritoryInSearchParams(searchParams);
  const publicDefaultCity = getPublicDefaultCityContext();
  const preferredCity = cityFromRef(cookieCity) || publicDefaultCity;

  const city = filters.city_slug
    ? cityFromSlug(filters.city_slug)
    : filters.city?.trim() || filters.state?.trim()
      ? cityFromText(filters.city, filters.state)
      : preferredCity;

  const title = buildMetadataTitle(filters, city, hasExplicitTerritory);
  const description = buildMetadataDescription(filters, city, hasExplicitTerritory);
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

  const filters = normalizeBuyFilters(searchParams);
  const hasExplicitTerritory = hasExplicitTerritoryInSearchParams(searchParams);

  const resolved = await resolveComprarData({
    filters,
    hasExplicitTerritory,
    cookieCity,
  });

  /**
   * Se houver território explícito e ele estiver vazio sob filtros puramente territoriais,
   * tenta redirecionar para outra cidade com estoque.
   *
   * Não redireciona quando a página está em modo aberto/preferencial,
   * para evitar loops e preservar a vitrine viva.
   */
  if (
    hasExplicitTerritory &&
    resolved.filters.city_slug &&
    isComprarTerritoryOnlyFilters(resolved.filters) &&
    resolved.initialResults.pagination.total === 0
  ) {
    const territory = await fetchCatalogAdsTerritoryFallback(resolved.filters.city_slug);

    if (
      territory?.mode === "fallback" &&
      territory.slug &&
      territory.slug !== resolved.filters.city_slug
    ) {
      const merged = mergeSearchFilters(resolved.filters, {
        city_slug: territory.slug,
        page: 1,
      });
      const qs = buildSearchQueryString(merged);
      redirect(qs ? `/comprar?${qs}` : "/comprar");
    }
  }

  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Comprar", href: "/comprar" },
    { name: hasExplicitTerritory ? resolved.city.name : "Catálogo" },
  ];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Catálogo de veículos em ${resolved.city.name}`,
    numberOfItems: resolved.initialResults.pagination.total,
    itemListElement: resolved.initialResults.data.slice(0, 20).map((ad, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteUrl(`/veiculo/${ad.slug || ad.id}`),
      name: ad.title || `${ad.brand ?? ""} ${ad.model ?? ""}`.trim() || "Veículo",
    })),
  };

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <BuyMarketplacePageClient
        initialResults={resolved.initialResults}
        initialFacets={resolved.initialFacets}
        initialFilters={resolved.filters}
        city={resolved.city}
      />
    </>
  );
}
