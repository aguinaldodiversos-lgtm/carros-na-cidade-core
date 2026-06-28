import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { normalizePublicAd, publicCatalogPageCopy } from "@/lib/public-contracts";
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
  hasRestrictiveFilters,
  normalizeStateFilters,
  normalizeUf,
  stateNameFromUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

type ComprarEstadualPageProps = {
  params: { uf: string };
  searchParams?: SearchParams;
};

// `force-dynamic` (correção SSR 2026-06-27): evita o Suspense vazio que
// transmitia o `<main>` (H1/catálogo) depois do footer. Padrão de /carros-em.
export const dynamic = "force-dynamic";

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

  // Briefing P2 2026-05-25 — base de copy vem do `publicCatalogPageCopy`
  // (fonte única); título refina com brand/model quando aplicável.
  // Mantém SEO atual + descrição focada em brand/model quando o user
  // filtrou (variantes mais específicas que a copy base).
  const baseCopy = publicCatalogPageCopy("state", { label: stateName, uf });

  const title =
    brand && model
      ? `${brand} ${model} em ${stateName} | Comprar`
      : brand
        ? `${brand} em ${stateName} | Comprar`
        : baseCopy.metaTitle ?? `Catálogo de veículos em ${stateName} | Comprar`;

  const description =
    brand && model
      ? `${brand} ${model} em ${stateName}: catálogo estadual com filtros e oportunidades por cidade no Carros na Cidade.`
      : brand
        ? `Carros ${brand} em ${stateName}: vitrine estadual com filtros inteligentes e anúncios reais em todas as cidades — Carros na Cidade.`
        : baseCopy.metaDescription ??
          `Catálogo de veículos em ${stateName}: explore anúncios do estado inteiro e refine pela sua cidade no Carros na Cidade.`;

  // PR 3 (briefing 2026-05-20): `/carros-usados/[uf]` é a canônica
  // estadual. Esta rota (`/comprar/estado/[uf]`) continua respondendo
  // por compatibilidade — links antigos, indexação histórica — mas
  // emite canonical APONTANDO PARA a nova canônica para consolidar
  // sinal SEO. Não há redirect 301 ainda (briefing item 2: "só após
  // validar produção e SEO").
  const canonicalPath = `/carros-usados/${uf.toLowerCase()}`;

  // URLs filtradas (brand, model, q, etc.) não devem ser indexadas.
  // Canonical já aponta para URL limpa; noindex é mais explícito para
  // que o Googlebot não desperdice crawl budget em variações de filtro.
  const noindex = hasRestrictiveFilters(filters);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    ...(noindex && { robots: { index: false, follow: true } }),
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

  // TerritoryContext unificado para o estado — consumido por crosslinks
  // futuros e pelo breadcrumb. Resolvido em paralelo com ads/facets.
  const regionalEnabled = isRegionalPageEnabled();
  const [resultsResponse, facetsResponse, territory] = await Promise.all([
    fetchAdsSearch(filters).then(
      (v) => ({ status: "fulfilled" as const, value: v }),
      (e) => ({ status: "rejected" as const, reason: e })
    ),
    fetchAdsFacets(filters).then(
      (v) => ({ status: "fulfilled" as const, value: v }),
      (e) => ({ status: "rejected" as const, reason: e })
    ),
    resolveTerritory({ level: "state", stateUf: uf }),
  ]);

  const initialResultsRaw =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  // Defesa em profundidade — briefing P2 2026-05-25:
  //   - `hasRealPrice` (P0) já filtra preço zero.
  //   - `normalizePublicAd` (P2) adiciona checks de slug válido + dirty
  //     data como safety net redundante ao DIRTY_TEST_AD_GUARD do backend.
  //   Não muda o tipo (`AdItem`) porque o BuyMarketplacePageClient
  //   espera shape original — só dropamos os que falhariam no card.
  const initialResults: AdsSearchResponse = {
    ...initialResultsRaw,
    data: (initialResultsRaw.data || [])
      .filter(hasRealPrice)
      .filter((ad) => normalizePublicAd(ad) !== null),
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
        Briefing 2026-05-20: Página Estadual abre direto com o catálogo
        (H1, busca, chips, listagem). Briefing 2026-05-24: removido o
        bloco "Cidades próximas de [cidade]" + "Outras cidades em
        [estado]" que ficava ao fim da página — parecia segundo rodapé.
      */}
      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={cityContext}
        variant="estadual"
        stateUf={uf}
        enableGeoRedirect
        regionalEnabled={regionalEnabled}
      />
    </>
  );
}
