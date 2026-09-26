"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { CatalogPagination } from "@/components/buy/CatalogPagination";
import { CATALOG_SORT_OPTIONS, CatalogResultsHeader } from "@/components/buy/CatalogResultsHeader";
import { FilterDrawer } from "@/components/buy/FilterDrawer";
import { FilterSidebar } from "@/components/buy/FilterSidebar";
import { VehicleGrid } from "@/components/buy/VehicleGrid";
import { AppliedFilterChips } from "@/components/search/AppliedFilterChips";
import { SearchBar } from "@/components/ui/SearchBar";
import {
  buildSidebarControlTotals,
  inferWeight,
  toSafeCatalogItems,
  type BuyCityContext,
} from "@/lib/buy/catalog-helpers";
import {
  buildModelLandingHref,
  countActiveUserFilters,
  type ModelLandingBrandLink,
} from "@/lib/buy/model-landing";
import type {
  AdsFacetsResponse,
  AdsSearchFilters,
  AdsSearchResponse,
} from "@/lib/search/ads-search";
import { mergeSearchFilters } from "@/lib/search/ads-search-url";

/**
 * Parte interativa da landing cidade + marca + modelo.
 *
 * Não é um catálogo novo: é a composição dos MESMOS blocos de
 * `BuyMarketplacePageClient` — `FilterSidebar`, `CatalogResultsHeader`,
 * `AppliedFilterChips`, `VehicleGrid` (card oficial) e `CatalogPagination`
 * (paginação com `<a href>`), no mesmo shell de 1600px com sidebar de 296px.
 *
 * O que muda em relação ao catálogo da cidade é só o que a rota exige:
 *   - cidade, marca e modelo são da ROTA: nunca entram na query, e os campos
 *     Marca/Modelo da sidebar não aparecem;
 *   - no celular, a primeira dobra termina no primeiro anúncio: uma barra de
 *     duas ações (Filtros | ordenação) e todo o refinamento dentro da gaveta —
 *     inclusive a busca, que no catálogo ocupa uma linha inteira do topo;
 *   - navegação por `router.push` e re-render no servidor, como o catálogo.
 *     Nada de buscar do navegador direto no backend.
 */

type ModelLandingCatalogProps = {
  city: BuyCityContext;
  /** Filtros do VISITANTE — sem cidade/marca/modelo, que pertencem à rota. */
  filters: AdsSearchFilters;
  results: AdsSearchResponse;
  facets: AdsFacetsResponse["facets"];
  popularBrandLinks: ModelLandingBrandLink[];
  regionalEnabled: boolean;
  searchPlaceholder: string;
  /** Rodapé da sidebar desktop ("Explorar em {cidade}"). */
  sidebarFooter?: ReactNode;
  /** Renderizado no lugar do grid quando não há anúncio. */
  emptyState?: ReactNode;
  /** Conteúdo depois da listagem (bloco de estoque, links no mobile). */
  children?: ReactNode;
};

const ROUTE_LOCKED_KEYS: Array<keyof AdsSearchFilters> = [
  "city",
  "city_slug",
  "city_id",
  "state",
  "brand",
  "model",
  "commercial_model",
];

function FiltersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const TOOLBAR_CONTROL =
  "flex h-12 w-full items-center rounded-2xl border border-cnc-line bg-cnc-surface font-semibold text-cnc-text-strong shadow-sm transition hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none";

export function ModelLandingCatalog({
  city,
  filters,
  results,
  facets,
  popularBrandLinks,
  regionalEnabled,
  searchPlaceholder,
  sidebarFooter,
  emptyState,
  children,
}: ModelLandingCatalogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState(filters.q || "");
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const sortId = useId();

  // A busca é campo controlado; depois de navegar, o valor volta a ser o da URL.
  useEffect(() => setQuery(filters.q || ""), [filters.q]);

  const items = useMemo(() => toSafeCatalogItems(results?.data, city), [results?.data, city]);
  const controlTotals = useMemo(
    () => buildSidebarControlTotals(results, facets),
    [results, facets]
  );
  const total = results?.pagination?.total || items.length || 0;
  const currentPage = results?.pagination?.page || filters.page || 1;
  const totalPages = results?.pagination?.totalPages || 1;
  const activeFilters = countActiveUserFilters(filters);
  const sort = filters.sort || "relevance";

  const navigate = useCallback(
    (href: string) => {
      startTransition(() => router.push(href));
    },
    [router]
  );

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const pushFilters = useCallback(
    (patch: Partial<AdsSearchFilters>) => {
      const merged = mergeSearchFilters(filters, { ...patch, page: 1 });
      navigate(buildModelLandingHref(pathname, merged));
      setDrawerOpen(false);
    },
    [filters, navigate, pathname]
  );

  const pushPage = useCallback(
    (patch: Partial<AdsSearchFilters>) => {
      navigate(buildModelLandingHref(pathname, filters, Number(patch.page) || 1));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [filters, navigate, pathname]
  );

  /** Mesmo builder do clique: `href` e destino não podem divergir. */
  const buildPageHref = useCallback(
    (target: number) => buildModelLandingHref(pathname, filters, target),
    [filters, pathname]
  );

  const clearFilters = useCallback(() => {
    navigate(pathname);
    setDrawerOpen(false);
  }, [navigate, pathname]);

  const brandHrefs = useMemo(
    () => new Map(popularBrandLinks.map((link) => [link.brand, link.href])),
    [popularBrandLinks]
  );

  const searchSlot = (
    <SearchBar
      variant="compact"
      value={query}
      onChange={setQuery}
      onSubmit={(value) => pushFilters({ q: value.trim() || undefined })}
      placeholder={searchPlaceholder}
      ariaLabel="Buscar nos resultados"
    />
  );

  const sidebarProps = {
    filters,
    city,
    brandOptions: [],
    modelOptions: [],
    popularBrands: popularBrandLinks.map(({ brand, total: count }) => ({ brand, total: count })),
    totalResults: total,
    onPatch: pushFilters,
    onClear: clearFilters,
    regionalEnabled,
    controlTotals,
    searchSlot,
    hideVehicleIdentity: true,
    popularBrandHref: (brand: string) => brandHrefs.get(brand) ?? `/cidade/${city.slug}`,
    cityScopeBasePath: pathname,
    sortShortcuts: { value: sort, onChange: (value: string) => pushFilters({ sort: value }) },
  };

  return (
    <>
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-1 sm:px-6 sm:pb-10 sm:pt-2 lg:pb-12">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[296px_minmax(0,1fr)] lg:items-start lg:gap-5">
          {/*
            Sidebar em fluxo normal — sem o `sticky` + altura máxima + rolagem
            interna do catálogo. Lá a lista tem dezenas de cards e a sidebar
            acompanha a rolagem; aqui a landing costuma ter poucos anúncios, e a
            rolagem interna escondia o "Explorar em {cidade}" no fim de uma
            caixa que ninguém rola. Em fluxo normal tudo aparece rolando a página.
          */}
          <aside aria-label="Filtros e navegação" className="hidden lg:block lg:self-start">
            <FilterSidebar {...sidebarProps} />
            {sidebarFooter ? <div className="mt-4">{sidebarFooter}</div> : null}
          </aside>

          <div className="min-w-0" aria-busy={isPending || undefined}>
            {/* Mobile: Filtros | ordenação, lado a lado, numa linha só. */}
            <div className="grid grid-cols-2 gap-2 lg:hidden" data-testid="model-landing-toolbar">
              <button
                ref={filtersButtonRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                aria-controls={drawerOpen ? drawerId : undefined}
                className={`${TOOLBAR_CONTROL} justify-center gap-2 px-3 text-[15px]`}
              >
                <FiltersIcon />
                Filtros
                {activeFilters > 0 ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white"
                    >
                      {activeFilters}
                    </span>
                    <span className="sr-only">
                      {`, ${activeFilters} ${activeFilters === 1 ? "filtro ativo" : "filtros ativos"}`}
                    </span>
                  </>
                ) : null}
              </button>
              <div className="relative">
                <label htmlFor={sortId} className="sr-only">
                  Ordenar resultados
                </label>
                <select
                  id={sortId}
                  value={sort}
                  onChange={(event) => pushFilters({ sort: event.target.value })}
                  className={`${TOOLBAR_CONTROL} appearance-none truncate pl-3 pr-8 text-[14px] min-[400px]:pl-4 min-[400px]:pr-10 min-[400px]:text-[15px]`}
                >
                  {CATALOG_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cnc-text-strong">
                  <ChevronDownIcon />
                </span>
              </div>
            </div>

            <AppliedFilterChips
              filters={filters}
              onRemove={pushFilters}
              onClearAll={clearFilters}
              lockedKeys={ROUTE_LOCKED_KEYS}
              className="pb-1 pt-2 lg:pt-0"
            />

            <div className="pt-2 lg:pt-0">
              <CatalogResultsHeader
                totalResults={total}
                sort={sort}
                onPatch={pushFilters}
                sortVisibility="desktop"
              />
            </div>

            <div
              className={`transition-opacity motion-reduce:transition-none ${isPending ? "opacity-60" : ""}`}
            >
              {items.length > 0 ? (
                <VehicleGrid items={items} inferWeight={inferWeight} columns="default" />
              ) : (
                emptyState
              )}
            </div>

            {items.length > 0 ? (
              <CatalogPagination
                page={currentPage}
                totalPages={totalPages}
                buildHref={buildPageHref}
                onPatch={pushPage}
              />
            ) : null}

            {children}
          </div>
        </div>
      </div>

      <FilterDrawer
        id={drawerId}
        open={drawerOpen}
        onClose={closeDrawer}
        title="Filtros"
        returnFocusRef={filtersButtonRef}
      >
        <FilterSidebar {...sidebarProps} idPrefix="fs-m" showApplyCta onApply={closeDrawer} />
      </FilterDrawer>
    </>
  );
}
