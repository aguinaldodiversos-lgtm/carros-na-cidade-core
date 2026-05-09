import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { hasRealPrice } from "@/lib/ads/has-real-price";
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
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import { fetchCatalogAdsTerritoryFallback } from "@/lib/search/catalog-ads-territory-fallback";
import {
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
 * Só aciona fallback territorial se o usuário NÃO filtrou nada específico.
 * Se ele escolheu brand=Honda e a cidade não tem Honda, manter vazio é o certo —
 * empurrar Atibaia como fallback mascararia a ausência do filtro dele.
 */
function hasRestrictiveFilters(filters: AdsSearchFilters): boolean {
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
      filters.below_fipe === true ||
      filters.highlight_only === true
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

    const res = await ssrResilientFetch(url, {
      headers: { Accept: "application/json" },
      logTag: "city-meta-comprar",
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

  const title =
    brand && model
      ? `${brand} ${model} em ${ctx.name} - ${ctx.state} | Comprar`
      : brand
        ? `${brand} em ${ctx.name} - ${ctx.state} | Comprar`
        : `Carros usados em ${ctx.name} - ${ctx.state} | Comprar`;

  const description =
    brand && model
      ? `${brand} ${model} em ${ctx.name} (${ctx.state}): anúncios locais, filtros inteligentes e oportunidades atualizadas no Carros na Cidade.`
      : brand
        ? `Carros ${brand} em ${ctx.name} (${ctx.state}): catálogo focado na sua cidade com ofertas reais e contexto local — Carros na Cidade.`
        : `Encontre carros usados à venda em ${ctx.name}, ${stateName}. Anúncios locais com filtros, preços e contexto da sua cidade no Carros na Cidade.`;

  // Fase 1 da auditoria territorial (docs/runbooks/territorial-canonical-audit.md):
  // /comprar/cidade/[slug] consolida sinal SEO em /carros-em/[slug], a
  // canônica intermediária da intenção "comprar carros na cidade".
  // Canonical é URL LIMPA — nunca carrega sort/limit/page/utm/filtros, que
  // antes vazavam via buildCityPath(slug, filters).
  const canonicalPath = `/carros-em/${encodeURIComponent(slug)}`;

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

  let initialResults =
    resultsResponse.status === "fulfilled" && isValidResultsResponse(resultsResponse.value)
      ? resultsResponse.value
      : buildEmptyResults(filters);

  let initialFacets =
    facetsResponse.status === "fulfilled" && isValidFacetsResponse(facetsResponse.value)
      ? facetsResponse.value.facets
      : buildEmptyFacets();

  /**
   * Fallback territorial: se a cidade pedida não tem estoque ativo e o usuário
   * não aplicou filtros específicos, consultamos o backend para descobrir a
   * cidade-vizinha mais forte no mesmo UF e refazemos a busca. Mantemos os
   * metadados da cidade original (ctx/SEO/canonical) e informamos o cliente
   * via `fallbackTerritory` para exibir aviso amarelo "mostrando ofertas em X".
   */
  let fallbackTerritory:
    | { requestedName: string; actualName: string; actualState: string; actualSlug: string }
    | undefined;

  if (initialResults.pagination.total === 0 && !hasRestrictiveFilters(filters)) {
    const fallback = await fetchCatalogAdsTerritoryFallback(slug);
    if (fallback && fallback.mode === "fallback" && fallback.slug && fallback.slug !== slug) {
      const fallbackFilters: AdsSearchFilters = { ...filters, city_slug: fallback.slug };
      const [fbResults, fbFacets] = await Promise.allSettled([
        fetchAdsSearch(fallbackFilters),
        fetchAdsFacets(fallbackFilters),
      ]);

      const fbResultsOk =
        fbResults.status === "fulfilled" && isValidResultsResponse(fbResults.value)
          ? fbResults.value
          : null;
      const fbFacetsOk =
        fbFacets.status === "fulfilled" && isValidFacetsResponse(fbFacets.value)
          ? fbFacets.value.facets
          : null;

      if (fbResultsOk && fbResultsOk.pagination.total > 0) {
        initialResults = fbResultsOk;
        initialFacets = fbFacetsOk ?? initialFacets;
        fallbackTerritory = {
          requestedName: ctx.name,
          actualName: fallback.name,
          actualState: fallback.state,
          actualSlug: fallback.slug,
        };
      }
    }
  }

  // Defesa em profundidade contra placeholder R$ 0 — vitrine pública
  // nunca pode mostrar card sem preço real (rodada de credibilidade).
  initialResults = {
    ...initialResults,
    data: (initialResults.data || []).filter(hasRealPrice),
  };

  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Comprar", href: "/comprar" },
    { name: `${ctx.name} (${ctx.state})` },
  ];

  // Em modo fallback (URL da cidade pedida, resultados de uma vizinha) nao
  // emitimos ItemList JSON-LD: googlebot cruzaria o schema de "São Paulo"
  // com URLs de anuncios de "Atibaia" — poluiria sinal de conteudo local.
  const itemListJsonLd = fallbackTerritory
    ? null
    : {
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
      {itemListJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      ) : null}
      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={ctx}
        variant="cidade"
        stateUf={ctx.state}
        fallbackTerritory={fallbackTerritory}
      />
    </>
  );
}
