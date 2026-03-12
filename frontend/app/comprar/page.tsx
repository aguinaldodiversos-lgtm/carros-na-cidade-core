import type { Metadata } from "next";
import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { fetchAdsFacets, fetchAdsSearch } from "@/lib/search/ads-search";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";

type SearchParams = Record<string, string | string[] | undefined>;

type CityContext = {
  name: string;
  state?: string;
  label: string;
  slug?: string;
};

type ComprarPageProps = {
  searchParams: SearchParams;
};

export const revalidate = 60;

function toReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      const value = searchParams[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

function normalizeBuyFilters(searchParams: SearchParams) {
  const parsed = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  return {
    ...parsed,
    sort: parsed.sort || "recent",
    page: parsed.page || 1,
    limit: parsed.limit || 18,
  };
}

function getCityContext(searchParams: SearchParams): CityContext {
  const filters = normalizeBuyFilters(searchParams);

  if (filters.city_slug) {
    const parts = filters.city_slug.split("-").filter(Boolean);
    const ufCandidate = parts.at(-1)?.toUpperCase();
    const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);
    const name = parts
      .slice(0, hasUf ? -1 : undefined)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    const state = hasUf ? ufCandidate : undefined;
    const resolvedName = name || "Sao Paulo";

    return {
      name: resolvedName,
      state,
      slug: filters.city_slug,
      label: state ? `${resolvedName} - ${state}` : resolvedName,
    };
  }

  if (filters.city) {
    const [namePart, statePart] = filters.city
      .split(" - ")
      .map((item) => item.trim())
      .filter(Boolean);

    const resolvedName = namePart || filters.city;
    const resolvedState = filters.state || statePart || undefined;

    return {
      name: resolvedName,
      state: resolvedState,
      label: resolvedState ? `${resolvedName} - ${resolvedState}` : resolvedName,
    };
  }

  return {
    name: "Sao Paulo",
    state: "SP",
    label: "Sao Paulo - SP",
  };
}

function hasCommercialFilters(searchParams: SearchParams) {
  const filters = normalizeBuyFilters(searchParams);

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
      filters.below_fipe ||
      filters.highlight_only ||
      (filters.city && !filters.city_slug)
  );
}

export async function generateMetadata({
  searchParams,
}: ComprarPageProps): Promise<Metadata> {
  const filters = normalizeBuyFilters(searchParams);
  const city = getCityContext(searchParams);
  const hasFilteredView = hasCommercialFilters(searchParams);

  const searchTerm =
    filters.brand && filters.model
      ? `${filters.brand} ${filters.model}`
      : filters.brand
        ? `carros ${filters.brand}`
        : "carros usados e seminovos";

  return {
    title: `${searchTerm} em ${city.name} | Comprar`,
    description: `Explore ${searchTerm} em ${city.name} com filtros locais, ordenacao premium, oportunidades abaixo da FIPE e estoque preparado para navegacao por cidade no Carros na Cidade.`,
    alternates: {
      canonical: "/comprar",
    },
    robots: hasFilteredView
      ? {
          index: false,
          follow: true,
          googleBot: {
            index: false,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

export default async function ComprarPage({ searchParams }: ComprarPageProps) {
  const filters = normalizeBuyFilters(searchParams);

  const [initialResults, initialFacetsResponse] = await Promise.all([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters).catch(() => null),
  ]);

  return (
    <BuyMarketplacePageClient
      initialResults={initialResults}
      initialFacets={initialFacetsResponse?.facets || null}
    />
  );
}
