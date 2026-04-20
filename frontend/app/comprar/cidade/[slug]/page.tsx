import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { toCityRef, type CityRef } from "@/lib/city/city-types";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
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
  buildCityPath,
  cityContextFromRef,
  cityContextFromSlug,
  isValidCitySlug,
  normalizeCityFilters,
  stateNameFromUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";

type ComprarCidadePageProps = {
  params: { slug: string };
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

/**
 * Resolve metadados da cidade direto no backend público.
 * Fallback silencioso para parse do slug — página não pode quebrar em SSR
 * por indisponibilidade do catálogo territorial.
 */
async function resolveCityMeta(slug: string): Promise<CityRef | null> {
  try {
    const url = resolveBackendApiUrl(`/api/public/cities/${encodeURIComponent(slug)}`);
    if (!url) return null;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: { city?: { id?: number | string; name?: string; slug?: string; state?: string } };
    };
    const c = json?.data?.city;
    if (!c) return null;
    return toCityRef({ id: c.id, slug: c.slug, name: c.name, state: c.state });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
  searchParams = {},
}: ComprarCidadePageProps): Promise<Metadata> {
  const slug = String(params.slug || "").trim();
  if (!isValidCitySlug(slug)) {
    return {
      title: "Comprar carros | Carros na Cidade",
      robots: { index: false, follow: true },
    };
  }

  const ref = await resolveCityMeta(slug);
  const ctx = cityContextFromRef(ref) || cityContextFromSlug(slug);
  const stateName = stateNameFromUf(ctx.state);
  const filters = normalizeCityFilters(slug, searchParams);

  const brand = filters.brand?.trim();
  const model = filters.model?.trim();

  const title = brand && model
    ? `${brand} ${model} em ${ctx.name} - ${ctx.state} | Comprar`
    : brand
      ? `${brand} em ${ctx.name} - ${ctx.state} | Comprar`
      : `Carros usados em ${ctx.name} - ${ctx.state} | Comprar`;

  const description = brand && model
    ? `${brand} ${model} em ${ctx.name} (${ctx.state}): anúncios locais, filtros inteligentes e oportunidades atualizadas no Carros na Cidade.`
    : brand
      ? `Carros ${brand} em ${ctx.name} (${ctx.state}): catálogo focado na sua cidade com ofertas reais e contexto local — Carros na Cidade.`
      : `Encontre carros usados à venda em ${ctx.name}, ${stateName}. Anúncios locais com filtros, preços e contexto da sua cidade no Carros na Cidade.`;

  const canonicalPath = buildCityPath(slug, filters);

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

export default async function ComprarCidadePage({
  params,
  searchParams = {},
}: ComprarCidadePageProps) {
  const slug = String(params.slug || "").trim();
  if (!isValidCitySlug(slug)) notFound();

  const ref = await resolveCityMeta(slug);
  const ctx = cityContextFromRef(ref) || cityContextFromSlug(slug);
  const filters = normalizeCityFilters(slug, searchParams);

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

  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Comprar", href: "/comprar" },
    { name: `${ctx.name} (${ctx.state})` },
  ];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Carros usados em ${ctx.name}`,
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
        city={ctx}
        variant="cidade"
        stateUf={ctx.state}
      />
    </>
  );
}
