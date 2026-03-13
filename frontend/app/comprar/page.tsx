// frontend/app/comprar/page.tsx
import type { Metadata } from "next";
import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import {
  fetchAdsFacets,
  fetchAdsSearch,
} from "@/lib/search/ads-search";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";

type SearchParams = Record<string, string | string[] | undefined>;

type ComprarPageProps = {
  searchParams?: SearchParams;
};

type CityContext = {
  name: string;
  state?: string;
  slug?: string;
  label: string;
};

export const dynamic = "force-dynamic";

const DEFAULT_CITY_NAME = "São Paulo";
const DEFAULT_CITY_STATE = "SP";
const DEFAULT_CITY_SLUG = "sao-paulo-sp";
const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 24;

function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildSearchParamsReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      return getFirstValue(searchParams[name]);
    },
  };
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function normalizeWord(word: string) {
  const lower = word.toLowerCase();

  const dictionary: Record<string, string> = {
    sao: "São",
    joao: "João",
    jose: "José",
    antonio: "Antônio",
    conceicao: "Conceição",
    maranhao: "Maranhão",
    piaui: "Piauí",
    goias: "Goiás",
    para: "Pará",
    amapa: "Amapá",
    ceara: "Ceará",
  };

  if (dictionary[lower]) return dictionary[lower];

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function prettifySlugValue(value?: string) {
  if (!value) return "";
  return value
    .split("-")
    .filter(Boolean)
    .map(normalizeWord)
    .join(" ");
}

function normalizeBuyFilters(searchParams: SearchParams = {}): AdsSearchFilters {
  const parsed = parseAdsSearchFiltersFromSearchParams(
    buildSearchParamsReader(searchParams)
  );

  const limit = clampNumber(parsed.limit, 1, MAX_LIMIT, DEFAULT_LIMIT);
  const page = clampNumber(parsed.page, 1, 9999, 1);

  return {
    ...parsed,
    city: parsed.city || `${DEFAULT_CITY_NAME} - ${DEFAULT_CITY_STATE}`,
    city_slug: parsed.city_slug || DEFAULT_CITY_SLUG,
    state: parsed.state || DEFAULT_CITY_STATE,
    sort: parsed.sort || "recent",
    page,
    limit,
  };
}

function getCityContext(filters: AdsSearchFilters): CityContext {
  if (filters.city) {
    const [namePart, statePart] = filters.city
      .split(" - ")
      .map((item) => item.trim())
      .filter(Boolean);

    const cityName = namePart || DEFAULT_CITY_NAME;
    const cityState = filters.state || statePart || DEFAULT_CITY_STATE;

    return {
      name: cityName,
      state: cityState,
      slug: filters.city_slug || DEFAULT_CITY_SLUG,
      label: `${cityName} - ${cityState}`,
    };
  }

  if (filters.city_slug) {
    const parts = filters.city_slug.split("-").filter(Boolean);
    const ufCandidate = parts.at(-1)?.toUpperCase();
    const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);

    const cityName = prettifySlugValue(
      hasUf ? parts.slice(0, -1).join("-") : parts.join("-")
    );

    return {
      name: cityName || DEFAULT_CITY_NAME,
      state: hasUf ? ufCandidate : filters.state || DEFAULT_CITY_STATE,
      slug: filters.city_slug,
      label: `${cityName || DEFAULT_CITY_NAME} - ${
        hasUf ? ufCandidate : filters.state || DEFAULT_CITY_STATE
      }`,
    };
  }

  return {
    name: DEFAULT_CITY_NAME,
    state: DEFAULT_CITY_STATE,
    slug: DEFAULT_CITY_SLUG,
    label: `${DEFAULT_CITY_NAME} - ${DEFAULT_CITY_STATE}`,
  };
}

function hasMeaningfulCommercialFilters(filters: AdsSearchFilters) {
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
      (filters.page && filters.page > 1) ||
      (filters.sort && filters.sort !== "recent")
  );
}

function buildTitle(filters: AdsSearchFilters, city: CityContext) {
  if (filters.brand && filters.model) {
    return `${filters.brand} ${filters.model} em ${city.name} | Comprar`;
  }

  if (filters.brand) {
    return `${filters.brand} em ${city.name} | Comprar`;
  }

  if (filters.below_fipe) {
    return `Oportunidades abaixo da FIPE em ${city.name} | Comprar`;
  }

  return `Carros usados e seminovos em ${city.name} | Comprar`;
}

function buildDescription(filters: AdsSearchFilters, city: CityContext) {
  if (filters.brand && filters.model) {
    return `Explore ${filters.brand} ${filters.model} em ${city.name} com filtros locais, ordenação premium e anúncios preparados para comparação rápida no Carros na Cidade.`;
  }

  if (filters.brand) {
    return `Explore carros ${filters.brand} em ${city.name} com filtros locais, oportunidades, estoque atualizado e navegação premium no Carros na Cidade.`;
  }

  if (filters.below_fipe) {
    return `Descubra oportunidades abaixo da FIPE em ${city.name} com filtros inteligentes, cards premium e navegação local no Carros na Cidade.`;
  }

  return `Explore carros usados e seminovos em ${city.name} com filtros locais, estoque atualizado, oportunidades e navegação premium no Carros na Cidade.`;
}

function buildKeywords(filters: AdsSearchFilters, city: CityContext) {
  const keywords = new Set<string>([
    `carros usados em ${city.name}`,
    `carros seminovos em ${city.name}`,
    `comprar carro em ${city.name}`,
    `veículos em ${city.name}`,
    "carros na cidade",
    "marketplace automotivo",
  ]);

  if (filters.brand) keywords.add(`${filters.brand} em ${city.name}`);
  if (filters.brand && filters.model) {
    keywords.add(`${filters.brand} ${filters.model} em ${city.name}`);
  }
  if (filters.below_fipe) keywords.add(`abaixo da fipe em ${city.name}`);

  return [...keywords];
}

function buildRobots(filters: AdsSearchFilters) {
  const indexable = !hasMeaningfulCommercialFilters(filters);

  return {
    index: indexable,
    follow: true,
    googleBot: {
      index: indexable,
      follow: true,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };
}

function buildEmptyResults(filters: AdsSearchFilters): AdsSearchResponse {
  return {
    success: true,
    data: [],
    pagination: {
      page: filters.page || 1,
      limit: filters.limit || DEFAULT_LIMIT,
      total: 0,
      totalPages: 1,
    },
    filters: filters as Record<string, unknown>,
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

export async function generateMetadata({
  searchParams = {},
}: ComprarPageProps): Promise<Metadata> {
  const filters = normalizeBuyFilters(searchParams);
  const city = getCityContext(filters);

  return {
    title: buildTitle(filters, city),
    description: buildDescription(filters, city),
    keywords: buildKeywords(filters, city),
    alternates: {
      canonical: "/comprar",
    },
    robots: buildRobots(filters),
    openGraph: {
      title: buildTitle(filters, city),
      description: buildDescription(filters, city),
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
  const city = getCityContext(filters);

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Comprar carros em ${city.name}`,
    description: buildDescription(filters, city),
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://carrosnacidade.com"}/comprar`,
    inLanguage: "pt-BR",
    isPartOf: {
      "@type": "WebSite",
      name: "Carros na Cidade",
      url: process.env.NEXT_PUBLIC_SITE_URL || "https://carrosnacidade.com",
    },
    about: {
      "@type": "Place",
      name: city.label,
      address: {
        "@type": "PostalAddress",
        addressLocality: city.name,
        addressRegion: city.state,
        addressCountry: "BR",
      },
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: initialResults.pagination.total || initialResults.data.length || 0,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: initialResults.data.slice(0, 12).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: item.slug
          ? `${
              process.env.NEXT_PUBLIC_SITE_URL || "https://carrosnacidade.com"
            }/veiculo/${item.slug}`
          : `${
              process.env.NEXT_PUBLIC_SITE_URL || "https://carrosnacidade.com"
            }/anuncios/${item.id}`,
        name:
          item.title ||
          [item.brand, item.model, item.year].filter(Boolean).join(" ") ||
          `Veículo ${index + 1}`,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
      />
    </>
  );
}
