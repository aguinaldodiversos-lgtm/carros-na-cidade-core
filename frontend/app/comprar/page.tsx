import type { Metadata } from "next";
import { redirect } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import {
  buildCityPath,
  buildStatePath,
  isValidCitySlug,
  normalizeNationalFilters,
  normalizeUf,
  toReader,
  type SearchParams,
} from "@/lib/buy/territory-variant";
import {
  DEFAULT_COMPRAR_CATALOG_LIMIT,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";
import { toAbsoluteUrl } from "@/lib/seo/site";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";

export const revalidate = 60;

/**
 * /comprar — catálogo público AMPLO (nacional).
 *
 * Histórico: esta rota era um redirect-only; sem `city_slug`/`state` na URL,
 * mandava silenciosamente para `/comprar/estado/SP` via
 * `getPublicDefaultCity()`. Isso escondia anúncios de outros estados e
 * passava a impressão de "site inacabado em SP" para usuários sem cookie de
 * cidade. A rodada de credibilidade exigiu remover esse filtro oculto.
 *
 * Regras atuais:
 *   1. URL traz `city_slug` válido → 307 para `/comprar/cidade/[slug]`
 *      (preserva canonical da cidade). `searchParams` não-territoriais
 *      seguem junto via `buildCityPath`.
 *   2. URL traz `state` válido → 307 para `/comprar/estado/[uf]`.
 *   3. SEM contexto explícito → renderiza SSR catálogo nacional. NÃO há
 *      mais redirect baseado em cookie/geo/default — território só vira
 *      filtro quando o usuário escolhe explicitamente (URL ou seletor de
 *      cidade no header).
 *
 * SEO: canonical é `/comprar` SEM query string; ItemList JSON-LD com até 20
 * primeiros itens; metadados refletem catálogo nacional.
 */

type ComprarPageProps = {
  searchParams?: SearchParams;
};

const DEFAULT_NATIONAL_CITY_LABEL = "Brasil";

const NATIONAL_CITY_CONTEXT = {
  name: DEFAULT_NATIONAL_CITY_LABEL,
  state: "BR",
  slug: "brasil",
  label: DEFAULT_NATIONAL_CITY_LABEL,
};

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

function getFirstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Comprar carros usados no Brasil | Carros na Cidade",
    description:
      "Catálogo nacional de veículos usados — filtre por marca, modelo, faixa de preço, ano e oportunidades abaixo da FIPE. Selecione sua cidade quando quiser focar a busca.",
    alternates: { canonical: "/comprar" },
    openGraph: {
      title: "Comprar carros usados no Brasil",
      description:
        "Catálogo nacional de veículos usados no Carros na Cidade. Filtre por marca, modelo, preço e oportunidades.",
      url: "/comprar",
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function ComprarEntryPage({ searchParams = {} }: ComprarPageProps) {
  // 1. Território explícito na URL → redireciona para a rota canônica.
  //    Isso preserva os canonicals de cidade/estado e evita conteúdo
  //    duplicado entre /comprar?city_slug=X e /comprar/cidade/X.
  //
  //    NÃO aplicamos `normalizeNationalFilters` aqui — ele injetaria
  //    `sort=recent` e `limit` default no redirect, poluindo o canonical
  //    da cidade/estado. Usamos parser cru para preservar exatamente os
  //    filtros que o usuário trouxe na URL.
  const rawFilters = parseAdsSearchFiltersFromSearchParams(toReader(searchParams));

  const citySlugFromUrl = (getFirstValue(searchParams.city_slug) || "").trim();
  if (citySlugFromUrl && isValidCitySlug(citySlugFromUrl)) {
    redirect(buildCityPath(citySlugFromUrl, rawFilters));
  }

  const ufFromUrl = normalizeUf(getFirstValue(searchParams.state));
  if (ufFromUrl) {
    redirect(buildStatePath(ufFromUrl, rawFilters));
  }

  // 2. SEM território explícito → catálogo NACIONAL.
  //    NÃO há redirect baseado em cookie/geo/DEFAULT_PUBLIC_CITY_SLUG.
  //    Comparar com versão anterior: tinha `redirect(buildStatePath("SP"))`.
  const filters = normalizeNationalFilters(searchParams);

  const [resultsResponse, facetsResponse] = await Promise.allSettled([
    fetchAdsSearch(filters),
    fetchAdsFacets(filters),
  ]);

  const initialResultsRaw =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  // Defesa em profundidade contra placeholder R$ 0 (rodada de credibilidade
  // anterior aplicou esse filtro nas vitrines FIPE; aqui também o catálogo
  // público nunca pode mostrar card sem preço real).
  const initialResults: AdsSearchResponse = {
    ...initialResultsRaw,
    data: (initialResultsRaw.data || []).filter(hasRealPrice),
  };

  const initialFacets =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Comprar" },
  ];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Catálogo de veículos usados no Brasil",
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
        city={NATIONAL_CITY_CONTEXT}
        variant="nacional"
      />
    </>
  );
}
