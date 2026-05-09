import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { toAbsoluteUrl } from "@/lib/seo/site";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";
import { DEFAULT_COMPRAR_CATALOG_LIMIT } from "@/lib/search/ads-search-url";
import {
  buildStatePath,
  normalizeStateFilters,
  normalizeUf,
  stateNameFromUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";

type ComprarEstadualPageProps = {
  params: { uf: string };
  searchParams?: SearchParams;
};

export const revalidate = 60;

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
  return { brands: [], models: [], fuelTypes: [], bodyTypes: [] };
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

export async function generateMetadata({
  params,
  searchParams = {},
}: ComprarEstadualPageProps): Promise<Metadata> {
  const uf = normalizeUf(params.uf);
  if (!uf) {
    return {
      title: "Comprar carros | Carros na Cidade",
      robots: { index: false, follow: true },
    };
  }

  const stateName = stateNameFromUf(uf);
  const filters = normalizeStateFilters(uf, searchParams);
  const brand = filters.brand?.trim();
  const model = filters.model?.trim();

  const title =
    brand && model
      ? `${brand} ${model} em ${stateName} | Comprar`
      : brand
        ? `${brand} em ${stateName} | Comprar`
        : `Catálogo de veículos em ${stateName} | Comprar`;

  const description =
    brand && model
      ? `${brand} ${model} em ${stateName}: catálogo estadual com filtros e oportunidades por cidade no Carros na Cidade.`
      : brand
        ? `Carros ${brand} em ${stateName}: vitrine estadual com filtros inteligentes e anúncios reais em todas as cidades — Carros na Cidade.`
        : `Catálogo de veículos em ${stateName}: explore anúncios do estado inteiro e refine pela sua cidade no Carros na Cidade.`;

  // Simétrico ao canonical limpo de /comprar/cidade/[slug] (Fase 1, ver
  // territorial-canonical-audit.md): a estadual consolida sinal SEO em
  // /comprar/estado/{uf} sem query string. `buildStatePath(uf, filters)`
  // vazaria sort/limit/brand/model/utm — fragmentaria o sinal e criaria
  // múltiplas URLs canônicas concorrentes para a mesma página.
  const canonicalPath = buildStatePath(uf);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function ComprarEstadualPage({
  params,
  searchParams = {},
}: ComprarEstadualPageProps) {
  const uf = normalizeUf(params.uf);
  if (!uf) notFound();

  const stateName = stateNameFromUf(uf);
  const filters = normalizeStateFilters(uf, searchParams);

  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  const initialResultsRaw =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  // Defesa em profundidade contra placeholder R$ 0 — vitrine pública
  // nunca pode mostrar card sem preço real.
  const initialResults: AdsSearchResponse = {
    ...initialResultsRaw,
    data: (initialResultsRaw.data || []).filter(hasRealPrice),
  };

  const initialFacets =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  const cityContext = {
    name: stateName,
    state: uf,
    slug: `estado-${uf.toLowerCase()}`,
    label: `${stateName} (${uf})`,
  };

  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Comprar", href: "/comprar" },
    { name: "Catálogo" },
  ];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Catálogo de veículos em ${stateName}`,
    numberOfItems: initialResults.pagination.total,
    itemListElement: initialResults.data.slice(0, 20).map((ad, index) => ({
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
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={cityContext}
        variant="estadual"
        stateUf={uf}
        enableGeoRedirect
      />
    </>
  );
}
