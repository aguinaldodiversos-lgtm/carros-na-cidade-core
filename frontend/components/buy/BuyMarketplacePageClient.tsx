"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { BuyHero } from "@/components/buy/BuyHero";
import { BuyPageShell } from "@/components/buy/BuyPageShell";
import { FilterSidebar } from "@/components/buy/FilterSidebar";
import { ResultsToolbar } from "@/components/buy/ResultsToolbar";
import { VehicleGrid } from "@/components/buy/VehicleGrid";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import {
  buildCatalogStats,
  DEFAULT_BRAND_OPTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_POPULAR_BRANDS,
  inferWeight,
  sortCatalogItems,
  toSafeBrandFacets,
  toSafeCatalogItems,
  toSafeModelFacets,
  type BuyCityContext,
} from "@/lib/buy/catalog-helpers";

interface BuyMarketplacePageClientProps {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
  initialFilters: AdsSearchFilters;
  city: BuyCityContext;
}

export default function BuyMarketplacePageClient({
  initialResults,
  initialFacets,
  initialFilters,
  city,
}: BuyMarketplacePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const rawItems = useMemo(
    () => toSafeCatalogItems(initialResults?.data, city),
    [initialResults?.data, city]
  );

  const items = useMemo(
    () => sortCatalogItems(rawItems, initialFilters.sort),
    [rawItems, initialFilters.sort]
  );

  const firstRow = useMemo(() => items.slice(0, 2), [items]);
  const remaining = useMemo(() => items.slice(2), [items]);

  const brandFacets = useMemo(
    () => toSafeBrandFacets(initialFacets?.brands),
    [initialFacets?.brands]
  );

  const modelFacets = useMemo(
    () => toSafeModelFacets(initialFacets?.models),
    [initialFacets?.models]
  );

  const brandOptions = useMemo(() => {
    const options = brandFacets.slice(0, 12).map((item) => ({
      label: item.brand,
      value: item.brand,
    }));

    return options.length > 0
      ? [{ label: "Selecionar marca", value: "" }, ...options]
      : DEFAULT_BRAND_OPTIONS;
  }, [brandFacets]);

  const modelOptions = useMemo(() => {
    const filtered = initialFilters.brand
      ? modelFacets.filter((item) => item.brand === initialFilters.brand)
      : modelFacets;

    const options = filtered.slice(0, 12).map((item) => ({
      label: item.model,
      value: item.model,
    }));

    return options.length > 0
      ? [{ label: "Selecionar modelo", value: "" }, ...options]
      : DEFAULT_MODEL_OPTIONS;
  }, [initialFilters.brand, modelFacets]);

  const popularBrands = useMemo(() => {
    return brandFacets.length > 0 ? brandFacets.slice(0, 5) : DEFAULT_POPULAR_BRANDS;
  }, [brandFacets]);

  const catalogStats = useMemo(() => buildCatalogStats(items), [items]);

  const pushFilters = useCallback(
    (patch: Partial<AdsSearchFilters>, resetPage = true) => {
      const merged = mergeSearchFilters(initialFilters, {
        ...patch,
        ...(resetPage ? { page: 1 } : {}),
      });

      const queryString = buildSearchQueryString(merged);
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
      setMobileFiltersOpen(false);
    },
    [initialFilters, pathname, router]
  );

  const totalAds = initialResults?.pagination?.total || items.length || 0;
  const mapHref = `/cidade/${encodeURIComponent(city.slug)}`;

  const filterSidebarProps = {
    filters: initialFilters,
    city,
    brandOptions,
    modelOptions,
    popularBrands,
    catalogStats,
    onPatch: (patch: Partial<AdsSearchFilters>) => pushFilters(patch),
  };

  return (
    <BuyPageShell
      mobileFilterTrigger={
        <>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-900 shadow-[0_8px_30px_-6px_rgba(15,23,42,0.35)] transition hover:bg-slate-50 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-blue-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filtros
          </button>

          {mobileFiltersOpen ? (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                aria-label="Fechar filtros"
                onClick={() => setMobileFiltersOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <span className="text-base font-bold text-slate-900">Filtros</span>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-blue-700"
                  >
                    Fechar
                  </button>
                </div>
                <div className="max-h-[calc(90vh-52px)] overflow-y-auto overscroll-contain px-2 pb-8 pt-2">
                  <FilterSidebar {...filterSidebarProps} className="border-0 shadow-none" />
                </div>
              </div>
            </div>
          ) : null}
        </>
      }
    >
      <main>
        <BuyHero cityName={city.name} totalAds={totalAds} />

        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] lg:items-start lg:gap-10">
            <aside className="hidden lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pb-8 lg:pr-1">
              <FilterSidebar {...filterSidebarProps} />
            </aside>

            <div className="min-w-0 flex-1">
              <div className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-slate-200/90 bg-white/60 px-3 py-2.5 lg:hidden">
                <p className="text-sm font-semibold text-slate-700">Refinar listagem</p>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="text-sm font-bold text-blue-700"
                >
                  Abrir filtros
                </button>
              </div>

              <ResultsToolbar
                filters={initialFilters}
                totalResults={totalAds}
                cityLabel={city.label}
                mapHref={mapHref}
                onLimitChange={(limit) => pushFilters({ limit })}
                onSortChange={(value) => pushFilters({ sort: value })}
              />

              <VehicleGrid featured={firstRow} rest={remaining} inferWeight={inferWeight} />
            </div>
          </div>
        </div>
      </main>
    </BuyPageShell>
  );
}
