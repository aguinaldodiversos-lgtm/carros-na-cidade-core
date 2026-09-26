import "server-only";
import { cache } from "react";

import { hasRealPrice } from "@/lib/ads/has-real-price";
import {
  buildModelListingRequest,
  parseModelLandingFilters,
  resolveModelLandingIdentity,
  type ModelLandingIdentity,
  type ModelLandingSearchParams,
} from "@/lib/buy/model-landing";
import { normalizePublicAd } from "@/lib/public-contracts";
import {
  fetchAdsFacets,
  fetchAdsSearch,
  type AdsFacetsResponse,
  type AdsSearchFilters,
  type AdsSearchResponse,
} from "@/lib/search/ads-search";
import {
  fetchCityModelTerritorialPage,
  type TerritorialListingFilters,
  type TerritorialPagePayload,
} from "@/lib/search/territorial-public";

/**
 * Carga SSR da landing cidade + marca + modelo.
 *
 * Três leituras, cada uma com um dono:
 *
 *   territorial  `/api/public/cities/:slug/brand/:brand/model/:model`
 *                identidade, SEO (canonical e a decisão de indexação pelo
 *                estoque PRÓPRIO da cidade — regra existente, preservada) e o
 *                filtro de produto exato (`listingFilters`).
 *   listagem     `/api/ads/search` — o MESMO pedido que `/carros-em/[slug]`
 *                faz, com o produto acrescentado. É aqui que o Search Policy
 *                Engine decide o território. A página não calcula raio, não
 *                lista cidades vizinhas, não reordena nada.
 *   facetas      `/api/ads/facets` da cidade — marcas populares e contagens da
 *                sidebar quando o motor não responde (caminho legado).
 *
 * O territorial vai SEM a query do visitante: identidade e indexação da
 * landing não dependem de filtro, e uma chave de cache só por landing evita
 * multiplicar o cache do backend por combinação de filtros.
 */

export interface ModelLandingData {
  identity: ModelLandingIdentity;
  territorial: TerritorialPagePayload;
  /** Filtros do VISITANTE (sem cidade/marca/modelo, que são da rota). */
  filters: AdsSearchFilters;
  results: AdsSearchResponse;
  facets: AdsFacetsResponse["facets"];
}

function emptyResults(filters: AdsSearchFilters): AdsSearchResponse {
  return {
    success: true,
    ok: true,
    data: [],
    pagination: { page: filters.page || 1, limit: filters.limit || 0, total: 0, totalPages: 1 },
    error: null,
  };
}

function titleize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Qual produto pedir ao motor.
 *
 *   objeto     backend resolveu (cidade, nacional ou URL FIPE antiga).
 *   `null`     backend afirmou que não há estoque ativo do modelo em lugar
 *              nenhum → não consulta.
 *   ausente    backend fora (payload de fallback) ou anterior a este campo.
 *              Pede pelos slugs: `commercial_model` compara com LOWER() dos
 *              dois lados, então "onix", "hb20" e "t-cross" já casam com o
 *              rótulo real. A página nessa situação é `noindex` de qualquer
 *              jeito — o objetivo é não deixar o comprador sem os carros.
 */
function resolveListingFilters(
  territorial: TerritorialPagePayload,
  route: { brand: string; model: string }
): TerritorialListingFilters | null {
  if (territorial.listingFilters === null) return null;
  if (territorial.listingFilters) return territorial.listingFilters;
  return { brand: titleize(route.brand), commercial_model: route.model };
}

async function load(
  slug: string,
  brand: string,
  model: string,
  searchKey: string
): Promise<ModelLandingData> {
  const searchParams = Object.fromEntries(
    new URLSearchParams(searchKey)
  ) as ModelLandingSearchParams;
  const filters = parseModelLandingFilters(searchParams);

  const [territorial, facetsResponse] = await Promise.all([
    fetchCityModelTerritorialPage(slug, brand, model),
    fetchAdsFacets({ city_slug: slug }),
  ]);

  const identity = resolveModelLandingIdentity(territorial, { slug, brand, model });
  const listing = resolveListingFilters(territorial, { brand, model });

  const raw = listing
    ? await fetchAdsSearch(buildModelListingRequest(filters, identity.citySlug, listing))
    : emptyResults(filters);

  // Mesma defesa da vitrine de cidade: nenhum card sem preço real e nenhum
  // anúncio sem slug (link impossível) chega ao grid.
  const results: AdsSearchResponse = {
    ...raw,
    data: (raw.data || []).filter((ad) => hasRealPrice(ad) && normalizePublicAd(ad) !== null),
  };

  return { identity, territorial, filters, results, facets: facetsResponse.facets };
}

const loadCached = cache(load);

/** Serializa a query numa chave estável para o `cache()` do React. */
function toSearchKey(searchParams: ModelLandingSearchParams = {}): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(searchParams).sort()) {
    const value = searchParams[key];
    if (Array.isArray(value)) {
      const first = value.find((item) => item !== undefined);
      if (first !== undefined) params.set(key, first);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params.toString();
}

/**
 * `generateMetadata` e a página chamam com os mesmos argumentos; o `cache()` do
 * React garante UMA carga por request.
 */
export function loadModelLanding(
  slug: string,
  brand: string,
  model: string,
  searchParams: ModelLandingSearchParams = {}
): Promise<ModelLandingData> {
  return loadCached(slug, brand, model, toSearchKey(searchParams));
}
