"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
  fetchAdsFacets,
  fetchAdsSearch,
} from "../../lib/search/ads-search";
import {
  buildSearchQueryString,
  mergeSearchFilters,
  parseAdsSearchFiltersFromSearchParams,
} from "../../lib/search/ads-search-url";
import { AppliedFilterChips } from "./AppliedFilterChips";
import { SearchFacetsSidebar } from "./SearchFacetsSidebar";
import { SearchPagination } from "./SearchPagination";
import { SearchResultsList } from "./SearchResultsList";
import { SearchSortSelect } from "./SearchSortSelect";
import { SmartVehicleSearch } from "./SmartVehicleSearch";

export function VehicleSearchResultsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<AdsSearchFilters>(() => {
    return parseAdsSearchFiltersFromSearchParams(searchParams);
  }, [searchParams]);

  const [results, setResults] = useState<AdsSearchResponse | null>(null);
  const [facets, setFacets] = useState<AdsFacetsResponse["facets"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [facetsLoading, setFacetsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resultsAbortRef = useRef<AbortController | null>(null);
  const facetsAbortRef = useRef<AbortController | null>(null);

  function pushFilters(patch: Partial<AdsSearchFilters>) {
    const nextFilters = mergeSearchFilters(filters, patch);
    const queryString = buildSearchQueryString(nextFilters);
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  function clearAll() {
    router.push(pathname);
  }

  useEffect(() => {
    if (resultsAbortRef.current) {
      resultsAbortRef.current.abort();
    }

    const controller = new AbortController();
    resultsAbortRef.current = controller;

    setLoading(true);
    setError(null);

    fetchAdsSearch(filters, controller.signal)
      .then((data) => {
        setResults(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar anúncios");
        setResults(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [filters]);

  useEffect(() => {
    if (facetsAbortRef.current) {
      facetsAbortRef.current.abort();
    }

    const controller = new AbortController();
    facetsAbortRef.current = controller;

    setFacetsLoading(true);

    fetchAdsFacets(filters, controller.signal)
      .then((data) => {
        setFacets(data.facets);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFacets(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setFacetsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    filters.brand,
    filters.model,
    filters.city_id,
    filters.city_slug,
    filters.below_fipe,
    filters.fuel_type,
    filters.transmission,
    filters.body_type,
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <div className="mb-6">
        <SmartVehicleSearch
          placeholder="Ex.: Hilux diesel em Campinas até 220 mil"
          resultsBasePath="/anuncios"
          currentCitySlug={filters.city_slug || null}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <AppliedFilterChips
          filters={filters}
          onRemove={pushFilters}
          onClearAll={clearAll}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            {loading ? (
              <span className="text-sm text-zinc-500">Carregando resultados...</span>
            ) : (
              <span className="text-sm text-zinc-600">
                {results?.pagination?.total || 0} anúncios encontrados
              </span>
            )}
          </div>

          <SearchSortSelect
            value={filters.sort || "relevance"}
            onChange={pushFilters}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <SearchFacetsSidebar
            facets={facetsLoading ? null : facets}
            filters={filters}
            onChange={pushFilters}
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
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"
                >
                  <div className="aspect-[16/10] animate-pulse bg-zinc-100" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 animate-pulse rounded bg-zinc-100" />
                    <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
                    <div className="h-6 w-1/2 animate-pulse rounded bg-zinc-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <SearchResultsList items={results?.data || []} />

              <SearchPagination
                page={results?.pagination?.page || 1}
                totalPages={results?.pagination?.totalPages || 1}
                onChange={(page) => pushFilters({ page })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
