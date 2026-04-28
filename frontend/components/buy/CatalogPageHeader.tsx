// frontend/components/buy/CatalogPageHeader.tsx
"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FilterChip } from "@/components/ui/FilterChip";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import { formatTotal, type BuyCityContext } from "@/lib/buy/catalog-helpers";
import { buildStatePath, type ComprarVariant, stateNameFromUf } from "@/lib/buy/territory-variant";

import { CatalogBreadcrumb } from "./CatalogBreadcrumb";

/**
 * PR H — Header da página /comprar/cidade/[slug] redesenhada.
 *
 * Layout mobile-first em vitrine local:
 *   1. Breadcrumb minimalista
 *   2. Aviso de fallback territorial (quando aplicável)
 *   3. H1 regional + contador de ofertas formatado
 *   4. Linha de chips rápidos (filtros comuns) — toggleam querystring
 *   5. SearchBar protagonista
 *   6. Filtros aplicados (FilterChip removível) + ordenação inline
 *
 * Sem hex hardcoded. SSR-friendly: o submit redireciona via router.push,
 * preservando preserve canonical/breadcrumb que vêm do Server Component
 * pai.
 */

/**
 * Ordem espelhada do mockup `pagina catalogo.png`:
 * Até R$ 50 mil • SUV • Automático • Abaixo da FIPE.
 *
 * "Em destaque" foi tirado dos chips rápidos (não consta no mockup) — o
 * filtro continua disponível via FilterSidebar / drawer mobile.
 */
const QUICK_FILTERS: ReadonlyArray<{
  key: string;
  label: string;
  matches: (filters: AdsSearchFilters) => boolean;
  apply: (filters: AdsSearchFilters) => Partial<AdsSearchFilters>;
  remove: () => Partial<AdsSearchFilters>;
}> = [
  {
    key: "ate-50k",
    label: "Até R$ 50 mil",
    matches: (f) => Number(f.max_price) === 50000,
    apply: () => ({ max_price: 50000, page: 1 }),
    remove: () => ({ max_price: undefined, page: 1 }),
  },
  {
    key: "suv",
    label: "SUV",
    matches: (f) => (f.body_type || "").toUpperCase() === "SUV",
    apply: () => ({ body_type: "SUV", page: 1 }),
    remove: () => ({ body_type: undefined, page: 1 }),
  },
  {
    key: "auto",
    label: "Automático",
    matches: (f) => (f.transmission || "").toLowerCase() === "automatic",
    apply: () => ({ transmission: "automatic", page: 1 }),
    remove: () => ({ transmission: undefined, page: 1 }),
  },
  {
    key: "below-fipe",
    label: "Abaixo da FIPE",
    matches: (f) => f.below_fipe === true,
    apply: () => ({ below_fipe: true, page: 1 }),
    remove: () => ({ below_fipe: undefined, page: 1 }),
  },
];

const SORT_OPTIONS = [
  { value: "relevance", label: "Mais relevantes" },
  { value: "recent", label: "Recém-publicados" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "year_desc", label: "Mais novo" },
  { value: "mileage_asc", label: "Menos km" },
  { value: "highlight", label: "Em destaque" },
];

type AppliedFilter = {
  key: string;
  label: string;
  value?: string;
  remove: () => Partial<AdsSearchFilters>;
};

function buildAppliedChips(filters: AdsSearchFilters): AppliedFilter[] {
  const chips: AppliedFilter[] = [];
  if (filters.brand) {
    chips.push({
      key: "brand",
      label: "Marca",
      value: filters.brand,
      remove: () => ({ brand: undefined, model: undefined, page: 1 }),
    });
  }
  if (filters.model) {
    chips.push({
      key: "model",
      label: "Modelo",
      value: filters.model,
      remove: () => ({ model: undefined, page: 1 }),
    });
  }
  if (filters.fuel_type) {
    chips.push({
      key: "fuel",
      label: "Combustível",
      value: filters.fuel_type,
      remove: () => ({ fuel_type: undefined, page: 1 }),
    });
  }
  if (filters.year_min || filters.year_max) {
    const range = [filters.year_min, filters.year_max].filter(Boolean).join("–");
    chips.push({
      key: "year",
      label: "Ano",
      value: range || "Filtrado",
      remove: () => ({ year_min: undefined, year_max: undefined, page: 1 }),
    });
  }
  if (filters.min_price || filters.max_price) {
    const fmt = (v?: number) =>
      v != null
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          }).format(v)
        : "";
    const range = [fmt(filters.min_price), fmt(filters.max_price)].filter(Boolean).join(" – ");
    chips.push({
      key: "price",
      label: "Preço",
      value: range || "Filtrado",
      remove: () => ({ min_price: undefined, max_price: undefined, page: 1 }),
    });
  }
  return chips;
}

type CatalogPageHeaderProps = {
  city: BuyCityContext;
  filters: AdsSearchFilters;
  totalResults: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  variant?: ComprarVariant;
  stateUf?: string;
  fallbackTerritory?: {
    requestedName: string;
    actualName: string;
    actualState: string;
    actualSlug: string;
  };
};

export function CatalogPageHeader({
  city,
  filters,
  totalResults,
  onPatch,
  variant = "estadual",
  stateUf,
  fallbackTerritory,
}: CatalogPageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(filters.q || "");

  const activeStateUf = stateUf || filters.state || city.state || "SP";
  const stateName = stateNameFromUf(activeStateUf);

  const breadcrumbItems = useMemo(() => {
    if (variant === "cidade") {
      return [
        { label: "Home", href: "/" },
        { label: "Comprar", href: "/comprar" },
        { label: `${city.name} (${city.state})` },
      ];
    }
    return [
      { label: "Home", href: "/" },
      { label: "Comprar", href: "/comprar" },
      { label: "Catálogo" },
    ];
  }, [variant, city.name, city.state]);

  const stateOptions = useMemo(
    () =>
      BRAZIL_UFS.map((uf) => ({
        label: `${uf.label} - ${uf.value}`,
        value: uf.value,
      })),
    []
  );

  const submitSearch = useCallback(
    (value: string) => {
      const merged = mergeSearchFilters(filters, {
        q: value.trim() || undefined,
        page: 1,
      });
      const qs = buildSearchQueryString(merged);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [filters, pathname, router]
  );

  const handleStateChange = useCallback(
    (uf: string) => {
      if (!uf) {
        onPatch({ state: undefined, city: undefined, city_slug: undefined, city_id: undefined });
        return;
      }
      if (variant === "cidade" || uf !== activeStateUf) {
        router.push(buildStatePath(uf, { ...filters, page: 1 }));
        return;
      }
      onPatch({ state: uf, city: undefined, city_slug: undefined, city_id: undefined });
    },
    [onPatch, variant, activeStateUf, filters, router]
  );

  const appliedChips = useMemo(() => buildAppliedChips(filters), [filters]);

  return (
    <div className="border-b border-cnc-line bg-cnc-surface">
      <div className="mx-auto w-full max-w-7xl px-4 pb-3 pt-3 sm:px-6 sm:pb-5 sm:pt-6 lg:px-8 lg:pt-8">
        <CatalogBreadcrumb items={breadcrumbItems} />

        {fallbackTerritory ? (
          <div
            role="status"
            className="mt-3 flex flex-col gap-2 rounded-lg border border-cnc-warning/40 bg-cnc-warning/10 p-3 text-sm text-cnc-text sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <p className="leading-snug">
              Ainda não há anúncios em <strong>{fallbackTerritory.requestedName}</strong>. Mostrando
              ofertas em{" "}
              <strong>
                {fallbackTerritory.actualName} ({fallbackTerritory.actualState})
              </strong>
              .
            </p>
            <Button
              href={buildStatePath(activeStateUf, filters)}
              variant="secondary"
              size="sm"
              className="shrink-0"
            >
              Ver todas de {stateName}
            </Button>
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-col gap-1 sm:mt-4 sm:gap-1.5">
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[26px] md:text-[32px] lg:text-[36px]">
            {variant === "cidade" ? (
              <>
                Carros usados em <span className="text-primary">{city.name}</span>
              </>
            ) : (
              <>
                Catálogo de veículos em <span className="text-primary">{stateName}</span>
              </>
            )}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-cnc-muted sm:text-sm md:text-base">
            <Badge variant="info" size="md">
              <span className="tabular-nums">{formatTotal(totalResults)}</span>
              {variant === "cidade" ? " ofertas locais" : " ofertas no estado"}
            </Badge>
            {variant === "cidade" ? (
              <>
                <span>em</span>
                <strong className="text-cnc-text-strong">
                  {city.name} - {city.state}
                </strong>
              </>
            ) : (
              <span>em todo o estado</span>
            )}
          </p>
        </div>

        {variant === "cidade" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={buildStatePath(activeStateUf, filters)}
              className="inline-flex items-center gap-1.5 rounded-full border border-cnc-line bg-cnc-surface px-3 py-1.5 font-semibold text-primary transition hover:border-primary hover:bg-primary-soft"
            >
              <span aria-hidden="true">←</span>
              Ampliar para {stateName}
            </Link>
            <span className="hidden text-cnc-muted sm:inline">
              Ou veja outras cidades do estado.
            </span>
          </div>
        ) : null}

        {/* Busca protagonista */}
        <div className="mt-4">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={submitSearch}
            placeholder="Buscar marca ou modelo nesta cidade"
            ariaLabel="Buscar no catálogo"
            filterButton={
              <Button type="submit" variant="primary" size="md" className="hidden sm:inline-flex">
                Buscar
              </Button>
            }
          />
        </div>

        {/* Chips de filtro rápido — toggleam querystring */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="sr-only">Filtros rápidos</span>
          {QUICK_FILTERS.map((f) => {
            const active = f.matches(filters);
            return (
              <Chip
                key={f.key}
                variant="filter"
                selected={active}
                onClick={() => onPatch(active ? f.remove() : f.apply(filters))}
              >
                {f.label}
              </Chip>
            );
          })}
        </div>

        {/* Filtros aplicados + ordenação */}
        <div className="mt-4 flex flex-col gap-3 border-t border-cnc-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {appliedChips.length > 0 ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-wideish text-cnc-muted">
                  Filtros aplicados
                </span>
                {appliedChips.map((chip) => (
                  <FilterChip
                    key={chip.key}
                    variant="removable"
                    label={chip.label}
                    value={chip.value}
                    onRemove={() => onPatch(chip.remove())}
                  />
                ))}
              </>
            ) : (
              <span className="text-xs text-cnc-muted-soft">Sem filtros avançados aplicados.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {variant !== "cidade" ? (
              <Select
                aria-label="Estado"
                value={activeStateUf}
                onChange={(event) => handleStateChange(event.target.value)}
                options={stateOptions}
                fullWidth={false}
                containerClassName="w-44"
              />
            ) : null}
            <Select
              aria-label="Ordenar por"
              value={filters.sort || "relevance"}
              onChange={(event) => onPatch({ sort: event.target.value, page: 1 })}
              options={SORT_OPTIONS}
              fullWidth={false}
              containerClassName="w-44"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
