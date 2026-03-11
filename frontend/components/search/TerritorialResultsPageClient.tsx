"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdsSearchFilters, AdsFacetsResponse } from "../../lib/search/ads-search";
import {
  buildSearchQueryString,
  mergeSearchFilters,
  parseAdsSearchFiltersFromSearchParams,
} from "../../lib/search/ads-search-url";
import {
  fetchCityBelowFipeTerritorialPage,
  fetchCityBrandTerritorialPage,
  fetchCityModelTerritorialPage,
  fetchCityOpportunitiesTerritorialPage,
  fetchCityTerritorialPage,
  TerritorialPagePayload,
} from "../../lib/search/territorial-public";
import { AppliedFilterChips } from "./AppliedFilterChips";
import { SearchFacetsSidebar } from "./SearchFacetsSidebar";
import { SearchPagination } from "./SearchPagination";
import { SearchResultsList } from "./SearchResultsList";
import { SearchSortSelect } from "./SearchSortSelect";
import { SmartVehicleSearch } from "./SmartVehicleSearch";
import { TerritorialBreadcrumbs } from "./TerritorialBreadcrumbs";
import { TerritorialHeroLinks } from "./TerritorialHeroLinks";
import { TerritorialInternalLinksSection } from "./TerritorialInternalLinksSection";

type TerritorialMode =
  | "city"
  | "brand"
  | "model"
  | "opportunities"
  | "below_fipe";

interface TerritorialResultsPageClientProps {
  mode: TerritorialMode;
  initialData: TerritorialPagePayload;
  slug: string;
  brand?: string;
  model?: string;
}

function getPrimaryItems(data: TerritorialPagePayload, mode: TerritorialMode) {
  if (mode === "brand" || mode === "model") {
    return data.sections?.ads || [];
  }

  if (mode === "opportunities") {
    return data.sections?.opportunityAds || [];
  }

  if (mode === "below_fipe") {
    return data.sections?.belowFipeAds || [];
  }

  return data.sections?.recentAds || [];
}

function getPrimaryPagination(data: TerritorialPagePayload, mode: TerritorialMode) {
  if (mode === "brand" || mode === "model") {
    return data.pagination?.ads;
  }

  if (mode === "opportunities") {
    return data.pagination?.opportunityAds;
  }

  if (mode === "below_fipe") {
    return data.pagination?.belowFipeAds;
  }

  return data.pagination?.recentAds;
}

function getLockedKeys(mode: TerritorialMode): Array<keyof AdsSearchFilters> {
  switch (mode) {
    case "brand":
      return ["city_slug", "brand"];
    case "model":
      return ["city_slug", "brand", "model"];
    case "opportunities":
    case "below_fipe":
      return ["city_slug", "below_fipe"];
    case "city":
    default:
      return ["city_slug"];
  }
}

function getFixedRouteFilters(
  mode: TerritorialMode,
  slug: string,
  brand?: string,
  model?: string
): Partial<AdsSearchFilters> {
  if (mode === "brand") {
    return {
      city_slug: slug,
      brand,
      page: 1,
    };
  }

  if (mode === "model") {
    return {
      city_slug: slug,
      brand,
      model,
      page: 1,
    };
  }

  if (mode === "opportunities" || mode === "below_fipe") {
    return {
      city_slug: slug,
      below_fipe: true,
      page: 1,
    };
  }

  return {
    city_slug: slug,
    page: 1,
  };
}

async function fetchModeData(
  mode: TerritorialMode,
  slug: string,
  searchParams: URLSearchParams,
  brand?: string,
  model?: string
) {
  if (mode === "brand" && brand) {
    return fetchCityBrandTerritorialPage(slug, brand, searchParams);
  }

  if (mode === "model" && brand && model) {
    return fetchCityModelTerritorialPage(slug, brand, model, searchParams);
  }

  if (mode === "opportunities") {
    return fetchCityOpportunitiesTerritorialPage(slug, searchParams);
  }

  if (mode === "below_fipe") {
    return fetchCityBelowFipeTerritorialPage(slug, searchParams);
  }

  return fetchCityTerritorialPage(slug, searchParams);
}

export function TerritorialResultsPageClient({
  mode,
  initialData,
  slug,
  brand,
  model,
}: TerritorialResultsPageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [data, setData] = useState<TerritorialPagePayload>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasHydratedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const filters = useMemo<AdsSearchFilters>(() => {
    const parsed = parseAdsSearchFiltersFromSearchParams(searchParams);
    return mergeSearchFilters(parsed, getFixedRouteFilters(mode, slug, brand, model));
  }, [searchParams, mode, slug, brand, model]);

  const lockedKeys = useMemo(() => getLockedKeys(mode), [mode]);
  const primaryItems = useMemo(() => getPrimaryItems(data, mode), [data, mode]);
  const primaryPagination = useMemo(
    () => getPrimaryPagination(data, mode),
    [data, mode]
  );

  function pushFilters(patch: Partial<AdsSearchFilters>) {
    const merged = mergeSearchFilters(filters, {
      ...patch,
      ...getFixedRouteFilters(mode, slug, brand, model),
    });

    const queryString = buildSearchQueryString(merged);
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function clearRemovableFilters() {
    const fixed = getFixedRouteFilters(mode, slug, brand, model);
    const queryString = buildSearchQueryString(fixed as AdsSearchFilters);
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams(searchParams.toString());

    setLoading(true);
    setError(null);

    fetchModeData(mode, slug, params, brand, model)
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Erro ao carregar página territorial"
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [mode, slug, brand, model, searchParams]);

  const facets: AdsFacetsResponse["facets"] | null = useMemo(() => {
    return data.facets
      ? {
          brands: data.facets.brands || [],
          models: data.facets.models || [],
          fuelTypes: (data.facets.fuelTypes || []).map((item) => ({
            fuel_type: item.fuel_type || "",
            total: Number(item.total || 0),
          })),
          bodyTypes: (data.facets.bodyTypes || []).map((item) => ({
            body_type: item.body_type || "",
            total: Number(item.total || 0),
          })),
        }
      : null;
  }, [data.facets]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <TerritorialBreadcrumbs data={data} mode={mode} />

      <section className="rounded-[28px] border border-[#e2e8f0] bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0e62d8]">
            SEO territorial
          </span>

          <h1 className="text-2xl font-extrabold text-[#0f172a] md:text-3xl">
            {data.seo?.title || "Resultados da cidade"}
          </h1>

          {data.seo?.description ? (
            <p className="max-w-4xl text-sm leading-6 text-[#64748b] md:text-base">
              {data.seo.description}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {data.city?.name && (
              <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-medium text-[#475569]">
                {data.city.name}
                {data.city.state ? ` - ${data.city.state}` : ""}
              </span>
            )}

            {data.brand?.name && (
              <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-medium text-[#475569]">
                Marca: {data.brand.name}
              </span>
            )}

            {data.model?.name && (
              <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-medium text-[#475569]">
                Modelo: {data.model.name}
              </span>
            )}

            {typeof data.stats?.totalAds === "number" && (
              <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-medium text-[#475569]">
                {data.stats.totalAds} anúncios
              </span>
            )}

            {typeof data.stats?.totalBelowFipeAds === "number" && (
              <span className="rounded-full bg-[#e9fff5] px-3 py-1 text-xs font-medium text-[#0f9f5f]">
                {data.stats.totalBelowFipeAds} abaixo da FIPE
              </span>
            )}
          </div>

          <TerritorialHeroLinks data={data} />
        </div>
      </section>

      <div className="mt-6">
        <SmartVehicleSearch
          placeholder="Ex.: Corolla XEi, Hilux diesel, Onix até 80 mil"
          resultsBasePath={pathname}
          currentCitySlug={slug}
        />
      </div>

      <div className="mt-6">
        <TerritorialInternalLinksSection data={data} />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <AppliedFilterChips
          filters={filters}
          onRemove={pushFilters}
          onClearAll={clearRemovableFilters}
          lockedKeys={lockedKeys}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[#64748b]">
            {loading
              ? "Atualizando resultados..."
              : `${primaryPagination?.total || primaryItems.length || 0} resultados`}
          </div>

          <SearchSortSelect
            value={filters.sort || "relevance"}
            onChange={pushFilters}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <SearchFacetsSidebar
            facets={facets}
            filters={filters}
            onChange={pushFilters}
            lockedKeys={lockedKeys}
          />
        </div>

        <div className="space-y-6">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-[24px] border border-[#e2e8f0] bg-white"
                >
                  <div className="aspect-[16/10] animate-pulse bg-[#eef2f7]" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 animate-pulse rounded bg-[#eef2f7]" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[#eef2f7]" />
                    <div className="h-6 w-1/2 animate-pulse rounded bg-[#eef2f7]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <SearchResultsList items={primaryItems} />

              <SearchPagination
                page={primaryPagination?.page || 1}
                totalPages={primaryPagination?.totalPages || 1}
                onChange={(page) => pushFilters({ page })}
              />
            </>
          )}
        </div>
      </div>

      <div className="mt-8">
        <TerritorialInternalLinksSection data={data} />
      </div>
    </main>
  );
}
