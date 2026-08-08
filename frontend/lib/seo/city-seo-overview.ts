import "server-only";

import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

/**
 * Loader SSR do CitySeoOverview (Fase 3) — o payload único dos módulos de
 * autoridade local da página de cidade.
 *
 * RESILIÊNCIA (Etapa 46 da fase / política herdada da Fase 2B.1): o resultado
 * distingue três estados que NÃO podem colapsar em "vazio":
 *
 *   ok          → o backend respondeu; `overview` reflete o inventário real,
 *                 inclusive quando ele está vazio (cidade sem carros).
 *   not_found   → a cidade não existe. Ausência legítima.
 *   unavailable → backend fora, 429, timeout, payload inválido. NÃO é "cidade
 *                 sem carros" — é "não sabemos". Os módulos somem da página em
 *                 vez de afirmar "0 veículos em Atibaia", que seria uma
 *                 informação falsa servida com cara de fato.
 *
 * Um `catch { return [] }` aqui reproduziria exatamente a falha silenciosa que
 * a Fase 2B.1 existiu para corrigir.
 */

export interface CitySeoBrandEntity {
  slug: string;
  label: string;
  activeAds: number;
  minPrice: number | null;
  qualified: boolean;
  path: string;
  lastUpdated: string | null;
}

export interface CitySeoModelEntity {
  slug: string;
  label: string;
  source: "override" | "compound" | "derived";
  brandSlug: string;
  brandLabel: string;
  activeAds: number;
  minPrice: number | null;
  maxPrice: number | null;
  minYear: number | null;
  maxYear: number | null;
  fipeVersions: string[];
  qualified: boolean;
  path: string;
  lastUpdated: string | null;
}

export interface CitySeoDealerEntity {
  slug: string;
  name: string;
  activeAds: number;
  minPrice: number | null;
  path: string;
}

export interface CitySeoNearbyCity {
  slug: string;
  name: string;
  state: string;
  distanceKm: number | null;
  activeAds: number;
  qualified: boolean;
  path: string;
}

export interface CitySeoFacetEntry {
  value: string;
  activeAds: number;
  qualified: boolean;
}

export interface CitySeoOverview {
  city: { id: number | string; slug: string; name: string; state: string | null };
  inventory: {
    activeAds: number;
    activeDealers: number;
    belowFipeCount: number;
    automaticCount: number;
    manualCount: number;
    minYear: number | null;
    maxYear: number | null;
    updatedAt: string | null;
  };
  priceStats: {
    minPrice: number | null;
    maxPrice: number | null;
    medianPrice: number | null;
    avgPrice: number | null;
    sampleSize: number;
    minSample: number;
    publishable: boolean;
  };
  brands: CitySeoBrandEntity[];
  models: CitySeoModelEntity[];
  unresolvedModelAds: number;
  facets: {
    bodyTypes: CitySeoFacetEntry[];
    fuelTypes: CitySeoFacetEntry[];
    transmissions: CitySeoFacetEntry[];
  };
  dealers: CitySeoDealerEntity[];
  nearbyCities: CitySeoNearbyCity[];
  thresholds: Record<string, number>;
  generatedAt: string;
}

export type CitySeoOverviewResult =
  | { status: "ok"; overview: CitySeoOverview }
  | { status: "not_found" }
  | { status: "unavailable" };

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
  const api =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:4000";
  return stripTrailingSlash(api);
}

export async function loadCitySeoOverview(slug: string): Promise<CitySeoOverviewResult> {
  const citySlug = String(slug || "").trim();
  if (!citySlug) return { status: "not_found" };

  try {
    const response = await ssrResilientFetch(
      `${getApiBaseUrl()}/api/public/cities/${encodeURIComponent(citySlug)}/seo-overview`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        logTag: "city-seo-overview",
        next: { revalidate: 60 },
      }
    );

    if (response.status === 404) return { status: "not_found" };

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(
        `[city-seo-overview] ${response.status} em ${citySlug} — módulos locais omitidos (indisponível, NÃO "sem estoque")`
      );
      return { status: "unavailable" };
    }

    const json = (await response.json()) as { success?: boolean; data?: CitySeoOverview };

    if (!json?.success || !json.data?.city?.slug) {
      // eslint-disable-next-line no-console
      console.error(`[city-seo-overview] payload inválido em ${citySlug} — módulos locais omitidos`);
      return { status: "unavailable" };
    }

    return { status: "ok", overview: json.data };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[city-seo-overview] falha em ${citySlug} — módulos locais omitidos`, error);
    return { status: "unavailable" };
  }
}

/** Marcas que podem virar link de malha (qualificadas pelo limiar central). */
export function qualifiedBrands(overview: CitySeoOverview): CitySeoBrandEntity[] {
  return overview.brands.filter((brand) => brand.qualified);
}

/** Modelos comerciais qualificados — os únicos que viram landing/link/sitemap. */
export function qualifiedModels(overview: CitySeoOverview): CitySeoModelEntity[] {
  return overview.models.filter((model) => model.qualified);
}
