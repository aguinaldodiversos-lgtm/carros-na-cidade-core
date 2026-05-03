import type { Metadata } from "next";
import { fetchAdsFacets, fetchAdsSearch } from "@/lib/search/ads-search";
import { parseAdsSearchFiltersFromSearchParams } from "@/lib/search/ads-search-url";
import { VehicleSearchResultsPage } from "../../components/search/VehicleSearchResultsPage";

type SearchParams = Record<string, string | string[] | undefined>;

function toReader(searchParams: SearchParams) {
  return {
    get(name: string) {
      const value = searchParams[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    },
  };
}

type AnunciosPageProps = {
  searchParams: SearchParams;
};

export const revalidate = 60;

function hasActiveFilters(searchParams: SearchParams) {
  return Object.values(searchParams).some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => Boolean(item));
    }

    return Boolean(value);
  });
}

export async function generateMetadata({ searchParams }: AnunciosPageProps): Promise<Metadata> {
  const filteredView = hasActiveFilters(searchParams);

  return {
    title: filteredView
      ? "Resultados de busca de carros | Carros na Cidade"
      : "Anúncios de carros usados e seminovos | Carros na Cidade",
    description: filteredView
      ? "Compare anúncios de carros usados e seminovos com filtros por marca, modelo, preço, quilometragem e localização no Carros na Cidade."
      : "Explore anúncios de carros usados e seminovos com filtros inteligentes, ofertas abaixo da FIPE e resultados organizados para encontrar o veículo ideal.",
    // Transição: /anuncios canonicaliza para /comprar (sem 301 nesta etapa).
    // /comprar é a URL canônica intermediária da Busca Livre. Páginas filtradas
    // continuam noindex (regra abaixo) — mesmo na transição não queremos indexar
    // URLs com query string.
    alternates: {
      canonical: "/comprar",
    },
    robots: filteredView
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

export default async function AnunciosPage({ searchParams }: AnunciosPageProps) {
  const filters = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const [initialResults, initialFacetsResponse] = await Promise.all([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters).catch(() => null),
  ]);

  return (
    <VehicleSearchResultsPage
      initialResults={initialResults}
      initialFacets={initialFacetsResponse?.facets || null}
    />
  );
}
