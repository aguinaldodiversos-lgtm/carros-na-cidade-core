"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { BuyPageShell } from "@/components/buy/BuyPageShell";
import { CatalogPageHeader } from "@/components/buy/CatalogPageHeader";
import { CatalogPagination } from "@/components/buy/CatalogPagination";
import { CatalogSeoBlock } from "@/components/buy/CatalogSeoBlock";
import { FilterSidebar } from "@/components/buy/FilterSidebar";
import { GeoToCityRedirect } from "@/components/buy/GeoToCityRedirect";
import { VehicleGrid } from "@/components/buy/VehicleGrid";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import {
  DEFAULT_BRAND_OPTIONS,
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_POPULAR_BRANDS,
  inferWeight,
  toSafeBrandFacets,
  toSafeCatalogItems,
  toSafeModelFacets,
  type BuyCityContext,
} from "@/lib/buy/catalog-helpers";
import type { ComprarVariant } from "@/lib/buy/territory-variant";

export type FallbackTerritoryInfo = {
  requestedName: string;
  actualName: string;
  actualState: string;
  actualSlug: string;
};

interface BuyMarketplacePageClientProps {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"];
  initialFilters: AdsSearchFilters;
  city: BuyCityContext;
  variant?: ComprarVariant;
  stateUf?: string;
  /** Ativa GeoToCityRedirect apenas em páginas estaduais. */
  enableGeoRedirect?: boolean;
  /** Preenchido quando SSR fez fallback automatico para outra cidade do mesmo UF. */
  fallbackTerritory?: FallbackTerritoryInfo;
}

export default function BuyMarketplacePageClient({
  initialResults,
  initialFacets,
  initialFilters,
  city,
  variant = "estadual",
  stateUf,
  enableGeoRedirect = false,
  fallbackTerritory,
}: BuyMarketplacePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const items = useMemo(
    () => toSafeCatalogItems(initialResults?.data, city),
    [initialResults?.data, city]
  );

  const brandFacets = useMemo(
    () => toSafeBrandFacets(initialFacets?.brands),
    [initialFacets?.brands]
  );

  const modelFacets = useMemo(
    () => toSafeModelFacets(initialFacets?.models),
    [initialFacets?.models]
  );

  const brandOptions = useMemo(() => {
    const options = brandFacets.slice(0, 20).map((item) => ({
      label: item.brand,
      value: item.brand,
    }));

    return options.length > 0
      ? [{ label: "Todas as marcas", value: "" }, ...options]
      : DEFAULT_BRAND_OPTIONS;
  }, [brandFacets]);

  const modelOptions = useMemo(() => {
    const filtered = initialFilters.brand
      ? modelFacets.filter((item) => item.brand === initialFilters.brand)
      : modelFacets;

    const options = filtered.slice(0, 20).map((item) => ({
      label: item.model,
      value: item.model,
    }));

    return options.length > 0
      ? [{ label: "Todos os modelos", value: "" }, ...options]
      : DEFAULT_MODEL_OPTIONS;
  }, [initialFilters.brand, modelFacets]);

  const popularBrands = useMemo(() => {
    return brandFacets.length > 0 ? brandFacets.slice(0, 8) : DEFAULT_POPULAR_BRANDS;
  }, [brandFacets]);

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

  const pushPage = useCallback(
    (patch: Partial<AdsSearchFilters>) => {
      const merged = mergeSearchFilters(initialFilters, patch);
      const queryString = buildSearchQueryString(merged);
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [initialFilters, pathname, router]
  );

  const clearFilters = useCallback(() => {
    router.push(pathname);
    setMobileFiltersOpen(false);
  }, [pathname, router]);

  const totalAds = initialResults?.pagination?.total || items.length || 0;
  const currentPage = initialResults?.pagination?.page || initialFilters.page || 1;
  const totalPages = initialResults?.pagination?.totalPages || 1;

  const sidebarProps = {
    filters: initialFilters,
    city,
    brandOptions,
    modelOptions,
    popularBrands,
    totalResults: totalAds,
    onPatch: (patch: Partial<AdsSearchFilters>) => pushFilters(patch),
    onClear: clearFilters,
  };

  return (
    <BuyPageShell
      mobileFilterTrigger={
        <>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-bold text-slate-900 shadow-[0_6px_24px_-6px_rgba(15,23,42,0.35)] transition hover:bg-slate-50 lg:hidden"
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
            <div
              className="fixed inset-0 z-50 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Filtros"
            >
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
                <div className="max-h-[calc(90vh-52px)] overflow-y-auto overscroll-contain px-3 pb-8 pt-3">
                  <FilterSidebar {...sidebarProps} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      }
    >
      {enableGeoRedirect && variant === "estadual" && stateUf ? (
        <GeoToCityRedirect stateUf={stateUf} filters={initialFilters} />
      ) : null}

      <CatalogPageHeader
        city={city}
        filters={initialFilters}
        totalResults={totalAds}
        onPatch={(patch) => pushFilters(patch)}
        variant={variant}
        stateUf={stateUf}
        fallbackTerritory={fallbackTerritory}
      />

      <main>
        <div className="mx-auto w-full max-w-7xl px-3 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8 lg:pb-12">
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] lg:items-start lg:gap-8">
            <aside className="hidden lg:sticky lg:top-[76px] lg:block lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pb-8 lg:pr-1">
              <FilterSidebar {...sidebarProps} />
            </aside>

            <div className="min-w-0 flex-1">
              <VehicleGrid items={items} inferWeight={inferWeight} />
              <CatalogPagination
                page={currentPage}
                totalPages={totalPages}
                onPatch={(patch) => pushPage(patch)}
              />
            </div>
          </div>
        </div>
      </main>

      <CatalogSeoBlock city={city} brands={brandFacets} />
    </BuyPageShell>
  );
}
