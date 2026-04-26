"use client";

import Link from "next/link";
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
import { SiteBottomNav } from "../shell/SiteBottomNav";
import { AppliedFilterChips } from "./AppliedFilterChips";
import { SearchFacetsSidebar } from "./SearchFacetsSidebar";
import { SearchPagination } from "./SearchPagination";
import { SearchResultsList } from "./SearchResultsList";
import { SearchSortSelect } from "./SearchSortSelect";

interface VehicleSearchResultsPageProps {
  initialResults: AdsSearchResponse;
  initialFacets: AdsFacetsResponse["facets"] | null;
}

function getCityProfileFromSlug(slug?: string | null) {
  if (!slug) return null;

  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);
  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    slug,
    name: cityName || "Sua cidade",
    uf: hasUf ? ufCandidate : "",
  };
}

function ToolbarButton({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${
        active
          ? "bg-white text-[#2f3a54] shadow-sm ring-1 ring-[#e2e8f0]"
          : "bg-[#f5f7fb] text-[#6b7488] hover:bg-[#edf1f7]"
      }`}
    >
      {children}
    </button>
  );
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
      .then((data) => setResults(data))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar anúncios");
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

    setFacetsLoading(true);

    fetchAdsFacets(filters, controller.signal)
      .then((data) => setFacets(data.facets))
      .catch(() => {
        if (controller.signal.aborted) return;
        setFacets(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFacetsLoading(false);
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

  const totalResults = results?.pagination?.total || 0;
  const cityProfile = getCityProfileFromSlug(filters.city_slug);

  const hero = useMemo(() => {
    const cityLabel = cityProfile?.name ? ` em ${cityProfile.name}` : "";
    const term =
      filters.brand && filters.model
        ? `${filters.brand} ${filters.model}`
        : filters.brand
          ? `carros ${filters.brand}`
          : "carros usados e seminovos";

    return {
      title: `${term}${cityLabel}`,
      subtitle: cityProfile
        ? `Compare anúncios, valor de mercado e contexto local para comprar melhor em ${cityProfile.name}.`
        : "Compare ofertas, refinie filtros e descubra o melhor contexto para comprar ou vender seu próximo veículo.",
      quickLinks: cityProfile
        ? [
            { label: `Cidade ${cityProfile.name}`, href: `/cidade/${cityProfile.slug}` },
            { label: "FIPE local", href: `/tabela-fipe/${cityProfile.slug}` },
            { label: "Simulador", href: `/simulador-financiamento/${cityProfile.slug}` },
            { label: "Blog local", href: `/blog/${cityProfile.slug}` },
          ]
        : [],
    };
  }, [cityProfile, filters.brand, filters.model]);

  return (
    <>
      <main className="min-h-screen bg-[#f3f4f7] pb-20 md:pb-0">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
          <section className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
            <div className="rounded-[28px] border border-[#e1e7f0] bg-white px-6 py-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <h1 className="max-w-xl text-[32px] font-extrabold leading-tight tracking-tight text-[#1d2538] md:text-[44px]">
                {hero.title}
              </h1>

              <p className="mt-4 max-w-2xl text-[17px] leading-7 text-[#6b7488]">{hero.subtitle}</p>

              <p className="mt-5 text-[20px] font-medium text-[#6b7488]">
                {totalResults.toLocaleString("pt-BR")} anúncios encontrados
              </p>

              {hero.quickLinks.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {hero.quickLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex h-10 items-center rounded-xl border border-[#d9e1ef] bg-[#f8fafe] px-4 text-sm font-semibold text-[#33405d] transition hover:border-[#c7d5f0] hover:bg-[#eef4ff]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[28px] border border-[#e1e7f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex h-full flex-col justify-between gap-5 rounded-[24px] border border-[#edf1f6] bg-[linear-gradient(135deg,#ffffff_0%,#fbfcff_100%)] px-6 py-6 md:flex-row md:items-center">
                <div>
                  <h2 className="text-[24px] font-black leading-tight text-[#1d2538] md:text-[36px]">
                    Ganhe visibilidade no momento certo
                  </h2>
                  <p className="mt-2 text-[18px] text-[#4f5a74]">
                    Ative plano, publique com limite correto e impulsione anúncios com maior
                    intenção local.
                  </p>
                </div>

                <div className="flex flex-col items-start gap-4 md:items-end">
                  <Link
                    href="/planos"
                    className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0e62d8] px-6 text-[16px] font-bold text-white transition hover:bg-[#0c4fb0]"
                  >
                    Ver planos e impulsionamento
                  </Link>

                  <div className="h-14 w-14 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#0e62d8_0deg,#28a8ff_120deg,#7c4dff_220deg,#ffb400_320deg,#0e62d8_360deg)] opacity-90" />
                </div>
              </div>
            </div>
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div>
              <SearchFacetsSidebar
                facets={facetsLoading ? facets : facets}
                filters={filters}
                onChange={pushFilters}
              />
            </div>

            <div className="space-y-5">
              <section className="rounded-[24px] border border-[#e1e7f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToolbarButton active>
                      {cityProfile ? `Busca em ${cityProfile.name}` : "Busca nacional"}
                    </ToolbarButton>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SearchSortSelect value={filters.sort || "recent"} onChange={pushFilters} />
                    {cityProfile ? (
                      <Link
                        href={`/cidade/${cityProfile.slug}`}
                        className="inline-flex h-11 items-center justify-center rounded-xl bg-[#f5f7fb] px-4 text-sm font-semibold text-[#6b7488] transition hover:bg-[#edf1f7]"
                      >
                        Ver hub da cidade
                      </Link>
                    ) : null}
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
                      className="overflow-hidden rounded-[22px] border border-[#e2e8f0] bg-white"
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

                  <div className="pt-2">
                    <SearchPagination
                      page={results?.pagination?.page || 1}
                      totalPages={results?.pagination?.totalPages || 1}
                      onChange={(page) => pushFilters({ page })}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteBottomNav />
    </>
  );
}
