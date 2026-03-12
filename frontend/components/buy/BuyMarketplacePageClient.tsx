"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import {
  fetchAdsFacets,
  fetchAdsSearch,
} from "@/lib/search/ads-search";
import {
  buildSearchQueryString,
  mergeSearchFilters,
  parseAdsSearchFiltersFromSearchParams,
} from "@/lib/search/ads-search-url";
import { AppliedFilterChips } from "@/components/search/AppliedFilterChips";
import { SearchPagination } from "@/components/search/SearchPagination";
import BuyCarsGrid from "@/components/buy/BuyCarsGrid";
import BuyFiltersSidebar from "@/components/buy/BuyFiltersSidebar";
import BuyHeaderPanel from "@/components/buy/BuyHeaderPanel";
import BuyResultsToolbar from "@/components/buy/BuyResultsToolbar";

type BuyMarketplacePageClientProps = {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"] | null;
};

type CityContext = {
  name: string;
  state?: string;
  label: string;
  slug?: string;
};

const DEFAULT_CITY: CityContext = {
  name: "Sao Paulo",
  state: "SP",
  label: "Sao Paulo - SP",
};

function normalizeBuyFilters(filters: AdsSearchFilters): AdsSearchFilters {
  return {
    ...filters,
    sort: filters.sort || "recent",
    page: filters.page || 1,
    limit: filters.limit || 18,
  };
}

function compactBuyFilters(filters: AdsSearchFilters): AdsSearchFilters {
  const compacted = { ...filters };

  if (compacted.sort === "recent") delete compacted.sort;
  if (compacted.page === 1) delete compacted.page;
  if (compacted.limit === 18) delete compacted.limit;

  return compacted;
}

function getCityContext(filters: AdsSearchFilters): CityContext {
  if (filters.city_slug) {
    const parts = filters.city_slug.split("-").filter(Boolean);
    const ufCandidate = parts.at(-1)?.toUpperCase();
    const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);
    const name = parts
      .slice(0, hasUf ? -1 : undefined)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    const state = hasUf ? ufCandidate : undefined;
    const resolvedName = name || DEFAULT_CITY.name;

    return {
      name: resolvedName,
      state,
      slug: filters.city_slug,
      label: state ? `${resolvedName} - ${state}` : resolvedName,
    };
  }

  if (filters.city) {
    const [cityPart, statePart] = filters.city
      .split(" - ")
      .map((item) => item.trim())
      .filter(Boolean);

    const resolvedName = cityPart || filters.city;
    const resolvedState = filters.state || statePart || undefined;

    return {
      name: resolvedName,
      state: resolvedState,
      label: resolvedState ? `${resolvedName} - ${resolvedState}` : resolvedName,
    };
  }

  return DEFAULT_CITY;
}

function buildHeroTitle(filters: AdsSearchFilters, city: CityContext) {
  if (filters.brand && filters.model) {
    return `${filters.brand} ${filters.model} em ${city.name}`;
  }

  if (filters.brand) {
    return `Carros ${filters.brand} usados e seminovos em ${city.name}`;
  }

  return `Carros usados e seminovos em ${city.name}`;
}

export default function BuyMarketplacePageClient({
  initialResults,
  initialFacets,
}: BuyMarketplacePageClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<AdsSearchFilters>(() => {
    const parsed = parseAdsSearchFiltersFromSearchParams(searchParams);
    return normalizeBuyFilters(parsed);
  }, [searchParams]);

  const [results, setResults] = useState<AdsSearchResponse | null>(initialResults);
  const [facets, setFacets] = useState<AdsFacetsResponse["facets"] | null>(initialFacets);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasHydratedRef = useRef(false);
  const resultsAbortRef = useRef<AbortController | null>(null);
  const facetsAbortRef = useRef<AbortController | null>(null);

  const city = useMemo(() => getCityContext(filters), [filters]);
  const totalResults = results?.pagination?.total || 0;
  const title = useMemo(() => buildHeroTitle(filters, city), [filters, city]);

  const quickLinks = useMemo(() => {
    if (city.slug) {
      return [
        { label: `Comprar em ${city.name}`, href: `/cidade/${city.slug}` },
        { label: "Tabela FIPE local", href: `/tabela-fipe/${city.slug}` },
        { label: "Simular financiamento", href: `/simulador-financiamento/${city.slug}` },
        { label: "Blog da cidade", href: `/blog/${city.slug}` },
      ];
    }

    return [
      { label: "Tabela FIPE", href: "/tabela-fipe" },
      { label: "Simular financiamento", href: "/simulador-financiamento" },
      { label: "Planos para anunciar", href: "/planos" },
    ];
  }, [city]);

  function pushFilters(patch: Partial<AdsSearchFilters>) {
    const merged = normalizeBuyFilters(mergeSearchFilters(filters, patch));
    const queryString = buildSearchQueryString(compactBuyFilters(merged));
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
      .then((data) => setResults(data))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar anuncios");
        setResults(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
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

    fetchAdsFacets(filters, controller.signal)
      .then((data) => setFacets(data.facets))
      .catch(() => {
        if (controller.signal.aborted) return;
        setFacets(null);
      });

    return () => controller.abort();
  }, [
    filters.brand,
    filters.model,
    filters.city,
    filters.city_id,
    filters.city_slug,
    filters.state,
    filters.below_fipe,
    filters.highlight_only,
    filters.transmission,
    filters.body_type,
    filters.fuel_type,
  ]);

  return (
    <main className="min-h-screen bg-[#f1f2f6]">
      <BuyHeaderPanel
        title={title}
        totalResults={totalResults}
        cityLabel={city.name}
        quickLinks={quickLinks}
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-24 xl:self-start">
            <BuyFiltersSidebar
              facets={facets}
              filters={filters}
              totalResults={totalResults}
              cityLabel={city.label}
              onChange={pushFilters}
              onClearAll={clearAll}
            />
          </div>

          <div className="space-y-5">
            <BuyResultsToolbar
              filters={filters}
              totalResults={totalResults}
              cityLabel={city.name}
              onChange={pushFilters}
            />

            <section className="rounded-[18px] border border-[#dbe4f0] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#0e62d8]">
                    Inventario vivo da cidade
                  </p>
                  <p className="text-sm text-[#5c6981]">
                    Pagina pronta para contexto local, filtros por URL e dados reais da
                    API oficial.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  {city.slug ? (
                    <Link
                      href={`/cidade/${city.slug}`}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dce4f0] bg-[#f8fbff] px-4 text-sm font-semibold text-[#334155] transition hover:border-[#c5d4eb] hover:text-[#0e62d8]"
                    >
                      Hub local
                    </Link>
                  ) : null}

                  <Link
                    href="/planos"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-bold text-white shadow-[0_10px_20px_rgba(14,98,216,0.18)] transition hover:bg-[#0c54bc]"
                  >
                    Patrocinar anuncio
                  </Link>
                </div>
              </div>

              <div className="mt-4">
                <AppliedFilterChips
                  filters={filters}
                  onRemove={pushFilters}
                  onClearAll={clearAll}
                />
              </div>
            </section>

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
                    className="overflow-hidden rounded-[24px] border border-[#dbe4f0] bg-white"
                  >
                    <div className="aspect-[16/10] animate-pulse bg-[#edf2f8]" />
                    <div className="space-y-3 p-5">
                      <div className="h-4 animate-pulse rounded bg-[#edf2f8]" />
                      <div className="h-4 w-2/3 animate-pulse rounded bg-[#edf2f8]" />
                      <div className="h-20 animate-pulse rounded-[20px] bg-[#edf2f8]" />
                      <div className="h-12 animate-pulse rounded-xl bg-[#edf2f8]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <BuyCarsGrid items={results?.data || []} />

                <div className="pt-2">
                  <SearchPagination
                    page={results?.pagination?.page || 1}
                    totalPages={results?.pagination?.totalPages || 1}
                    onChange={(page) => pushFilters({ page })}
                  />
                </div>
              </>
            )}

            <section className="rounded-[20px] border border-[#dbe4f0] bg-[linear-gradient(135deg,#10234a_0%,#173974_55%,#0e62d8_100%)] p-5 text-white shadow-[0_18px_38px_rgba(10,20,40,0.18)] sm:p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-white/70">
                    Conversao comercial
                  </p>
                  <h2 className="mt-2 text-[24px] font-black leading-tight tracking-[-0.03em] sm:text-[28px]">
                    Destaque seu estoque ou simule a proxima compra com contexto local.
                  </h2>
                  <p className="mt-3 text-[14px] leading-7 text-white/78 sm:text-sm">
                    A pagina Comprar foi estruturada para navegar por cidade, comparar
                    estoque vivo e acelerar visita, lead e decisao comercial.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link
                    href="/planos"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#123162] transition hover:bg-[#eef4ff]"
                  >
                    Anunciar gratis
                  </Link>
                  <Link
                    href={city.slug ? `/simulador-financiamento/${city.slug}` : "/simulador-financiamento"}
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 px-5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    Simular financiamento
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
