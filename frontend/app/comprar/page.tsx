import type { Metadata } from "next";
import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { fetchAdsFacets, fetchAdsSearch } from "@/lib/search/ads-search";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";

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

function normalizeBuyFilters(searchParams: SearchParams = {}): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  return {
    ...parsed,
    city_slug: parsed.city_slug || "sao-paulo-sp",
    city: parsed.city || "São Paulo",
    state: parsed.state || "SP",
    sort: parsed.sort || "recent",
    page: parsed.page || 1,
    limit: parsed.limit || 18,
  };
}

function resolveCity(filters: AdsSearchFilters): CityContext {
  if (filters.city_slug) {
    return cityFromSlug(filters.city_slug);
  }

  return cityFromText(filters.city, filters.state);
}

function buildEmptyResults(filters: AdsSearchFilters): AdsSearchResponse {
  return {
    success: false,
    ok: false,
    data: [],
    pagination: {
      page: filters.page || 1,
      limit: filters.limit || 18,
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

  return `Carros usados e seminovos em ${city.name} | Comprar`;
}

function buildMetadataDescription(filters: AdsSearchFilters, city: CityContext) {
  if (filters.brand && filters.model) {
    return `Explore ${filters.brand} ${filters.model} em ${city.name} com catálogo premium, filtros rápidos, veículos em destaque e oportunidades locais no Carros na Cidade.`;
  }

  if (filters.brand) {
    return `Explore carros ${filters.brand} em ${city.name} com filtros rápidos, anúncios premium e oportunidades locais no Carros na Cidade.`;
  }

  return `Explore carros usados e seminovos em ${city.name} com filtros rápidos, anúncios premium, oportunidades locais e catálogo automotivo profissional no Carros na Cidade.`;
}

export async function generateMetadata({
  searchParams = {},
}: ComprarPageProps): Promise<Metadata> {
  const filters = normalizeBuyFilters(searchParams);
  const city = resolveCity(filters);

  const title = buildMetadataTitle(filters, city);
  const description = buildMetadataDescription(filters, city);

  return {
    title,
    description,
    alternates: {
      canonical: "/comprar",
    },
    openGraph: {
      title,
      description,
      url: "/comprar",
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function ComprarPage({
  searchParams = {},
}: ComprarPageProps) {
  const filters = normalizeBuyFilters(searchParams);
  const city = resolveCity(filters);

  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  const initialResults =
    resultsResponse.status === "fulfilled" &&
    isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  const initialFacets =
    facetsResponse.status === "fulfilled" &&
    isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  return (
    <BuyMarketplacePageClient
      initialResults={initialResults}
      initialFacets={initialFacets}
      initialFilters={filters}
      city={city}
    />
  );
}
