import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { StateRegionsBlock } from "@/components/territorial/StateRegionsBlock";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
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
import { fetchStateRegions } from "@/lib/territory/fetch-state-regions";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

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

  // TerritoryContext unificado para o estado — consumido pelo bloco SEO
  // e por crosslinks futuros. Resolvido em paralelo com ads/facets.
  const regionalEnabled = isRegionalPageEnabled();

  const [resultsResponse, facetsResponse, territory, stateRegionsPayload] =
    await Promise.all([
      fetchAdsSearch(filters).then(
        (v) => ({ status: "fulfilled" as const, value: v }),
        (e) => ({ status: "rejected" as const, reason: e })
      ),
      fetchAdsFacets(filters).then(
        (v) => ({ status: "fulfilled" as const, value: v }),
        (e) => ({ status: "rejected" as const, reason: e })
      ),
      resolveTerritory({ level: "state", stateUf: uf }),
      // Bloco "Explore por região" só faz fetch quando a flag regional
      // estiver ativa — links regionais com flag off são 404. Quando a
      // flag está off, o bloco fica totalmente oculto (sem fetch).
      regionalEnabled
        ? fetchStateRegions(uf, { limit: 8 })
        : Promise.resolve(null),
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

  // Breadcrumbs vêm do TerritoryResolver (single source of truth do
  // contrato territorial). Mapeia `{label, href}` → `{name, href?}` que
  // BreadcrumbJsonLd espera. O item final (página atual) não tem href
  // por convenção — removemos o href do último item.
  const breadcrumbItems = territory.breadcrumbs.map((bc, idx, all) => ({
    name: bc.label,
    href: idx === all.length - 1 ? undefined : bc.href,
  }));

  const stateRegions = stateRegionsPayload?.regions ?? [];

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
      {/*
        Bloco "Explore por região" — vem antes da grade para alinhar
        com o princípio territorial: o estado conduz para regiões.
        Suprime-se quando a flag regional está off OU quando o
        endpoint não retorna regiões (estado sem cobertura ainda).
      */}
      {regionalEnabled && stateRegions.length > 0 ? (
        <StateRegionsBlock stateName={stateName} regions={stateRegions} maxCards={8} />
      ) : null}
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
