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

interface VehicleSearchResultsPageProps {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"] | null;
}

export function VehicleSearchResultsPage({
  initialResults,
  initialFacets,
}: VehicleSearchResultsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<AdsSearchFilters>(() => {
    return parseAdsSearchFiltersFromSearchParams(searchParams);
  }, [searchParams]);

  const [results, setResults] = useState<AdsSearchResponse | null>(initialResults);
  const [facets, setFacets] = useState<AdsFacetsResponse["facets"] | null>(initialFacets);
  const [loading, setLoading] = useState(false);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasHydratedRef = useRef(false);
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
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      return;
    }

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

    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    if (!hasHydratedRef.current) return;

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

    return () => controller.abort();
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
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <section className="rounded-[28px] border border-[#e2e8f0] bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] md:p-6">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0e62d8]">
            Busca inteligente
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0f172a] md:text-3xl">
            Encontre o veículo certo na sua cidade
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-[#64748b] md:text-base">
            Explore anúncios com filtros avançados, ordenação, busca semântica e
            resultados pensados para navegação rápida e conversão.
          </p>
        </div>

        <div className="mt-5">
          <SmartVehicleSearch
            placeholder="Ex.: Hilux diesel em Campinas até 220 mil"
            resultsBasePath="/anuncios"
            currentCitySlug={filters.city_slug || null}
          />
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-3">
        <AppliedFilterChips
          filters={filters}
          onRemove={pushFilters}
          onClearAll={clearAll}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[#64748b]">
            {loading ? "Atualizando resultados..." : `${results?.pagination?.total || 0} anúncios encontrados`}
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
            facets={facetsLoading ? facets : facets}
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
    </main>
  );
}
