// frontend/app/comprar/page.tsx
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

type CityContext = {
  name: string;
  state: string;
  slug: string;
  label: string;
};

export const revalidate = 60;

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

function normalizeTextPart(value: string) {
  const lower = value.toLowerCase();
  if (lower === "sao") return "São";
  if (lower === "joao") return "João";
  if (lower === "jose") return "José";
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function cityFromSlug(slug: string): CityContext {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);

  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map(normalizeTextPart)
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

function normalizeBuyFilters(searchParams: SearchParams = {}): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  return {
    ...parsed,
    city_slug: parsed.city_slug || "sao-paulo-sp",
    city: parsed.city || "São Paulo - SP",
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

  return {
    name: "São Paulo",
    state: "SP",
    slug: "sao-paulo-sp",
    label: "São Paulo - SP",
  };
}

function buildEmptyResults(filters: AdsSearchFilters): AdsSearchResponse {
  return {
    success: true,
    data: [],
    pagination: {
      page: filters.page || 1,
      limit: filters.limit || 18,
      total: 0,
      totalPages: 1,
    },
  } as AdsSearchResponse;
}

function buildEmptyFacets(): AdsFacetsResponse["facets"] {
  return {
    brands: [],
    models: [],
    fuelTypes: [],
    bodyTypes: [],
  };
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
    return `Explore ${filters.brand} ${filters.model} em ${city.name} com catálogo premium, filtros rápidos e anúncios de destaque no Carros na Cidade.`;
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

  return {
    title: buildMetadataTitle(filters, city),
    description: buildMetadataDescription(filters, city),
    alternates: {
      canonical: "/comprar",
    },
    openGraph: {
      title: buildMetadataTitle(filters, city),
      description: buildMetadataDescription(filters, city),
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
    resultsResponse.status === "fulfilled"
      ? resultsResponse.value
      : buildEmptyResults(filters);

  const initialFacets =
    facetsResponse.status === "fulfilled"
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
