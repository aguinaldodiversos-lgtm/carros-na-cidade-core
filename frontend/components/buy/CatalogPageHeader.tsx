"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildSearchQueryString, mergeSearchFilters } from "@/lib/search/ads-search-url";
import { formatTotal, type BuyCityContext } from "@/lib/buy/catalog-helpers";

import { CatalogBreadcrumb } from "./CatalogBreadcrumb";

const BODY_OPTIONS = [
  { label: "Todas carrocerias", value: "" },
  { label: "SUV", value: "SUV" },
  { label: "Sedã", value: "Sedan" },
  { label: "Hatch", value: "Hatch" },
  { label: "Picape", value: "Picape" },
  { label: "Utilitário", value: "Utilitario" },
  { label: "Esportivo", value: "Esportivo" },
];

const MILEAGE_OPTIONS = [
  { label: "Qualquer km", value: "" },
  { label: "Até 20 mil km", value: "20000" },
  { label: "Até 40 mil km", value: "40000" },
  { label: "Até 60 mil km", value: "60000" },
  { label: "Até 100 mil km", value: "100000" },
];

const SORT_OPTIONS = [
  { label: "Mais relevantes", value: "relevance" },
  { label: "Últimos anúncios", value: "recent" },
  { label: "Mais novo", value: "year_desc" },
  { label: "Menor preço", value: "price_asc" },
  { label: "Maior preço", value: "price_desc" },
  { label: "Menos km", value: "mileage_asc" },
  { label: "Em destaque", value: "highlight" },
];

type CatalogPageHeaderProps = {
  city: BuyCityContext;
  filters: AdsSearchFilters;
  totalResults: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
};

export function CatalogPageHeader({
  city,
  filters,
  totalResults,
  onPatch,
}: CatalogPageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const formId = useId();

  const [query, setQuery] = useState(filters.q || filters.brand || "");

  const breadcrumbItems = useMemo(
    () => [
      { label: "Home", href: "/" },
      { label: "Comprar", href: "/comprar" },
      { label: "Catálogo" },
    ],
    []
  );

  const handleStateChange = useCallback(
    (uf: string) => {
      if (!uf) {
        onPatch({ state: undefined, city: undefined, city_slug: undefined, city_id: undefined });
        return;
      }
      onPatch({ state: uf, city: undefined, city_slug: undefined, city_id: undefined });
    },
    [onPatch]
  );

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const trimmed = query.trim();
      const merged = mergeSearchFilters(filters, {
        q: trimmed || undefined,
        page: 1,
      });
      const qs = buildSearchQueryString(merged);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [query, filters, pathname, router]
  );

  return (
    <div className="border-b border-slate-200/70 bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <CatalogBreadcrumb items={breadcrumbItems} />

        <div className="mt-4 flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900 md:text-[34px]">
            Catálogo de veículos em <span className="text-blue-700">{city.name}</span>
          </h1>
          <p className="text-[15px] text-slate-500">
            <span className="font-semibold tabular-nums text-slate-700">
              {formatTotal(totalResults)}
            </span>{" "}
            ofertas disponíveis perto de você.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.25)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]"
          role="search"
          aria-label="Buscar no catálogo"
        >
          <div className="relative">
            <label htmlFor={`${formId}-q`} className="sr-only">
              Buscar marca ou modelo
            </label>
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id={`${formId}-q`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar marca ou modelo"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          <div>
            <label htmlFor={`${formId}-state`} className="sr-only">
              Estado
            </label>
            <select
              id={`${formId}-state`}
              value={filters.state || city.state || ""}
              onChange={(event) => handleStateChange(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="">Todos os estados</option>
              {BRAZIL_UFS.map((uf) => (
                <option key={uf.value} value={uf.value}>
                  {uf.label} - {uf.value}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-body`} className="sr-only">
              Carroceria
            </label>
            <select
              id={`${formId}-body`}
              value={filters.body_type || ""}
              onChange={(event) => onPatch({ body_type: event.target.value || undefined, page: 1 })}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              {BODY_OPTIONS.map((opt) => (
                <option key={`body-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-km`} className="sr-only">
              Quilometragem máxima
            </label>
            <select
              id={`${formId}-km`}
              value={String(filters.mileage_max || "")}
              onChange={(event) =>
                onPatch({
                  mileage_max: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                })
              }
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              {MILEAGE_OPTIONS.map((opt) => (
                <option key={`km-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${formId}-sort`}
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
            >
              Ordenar por
            </label>
            <select
              id={`${formId}-sort`}
              value={filters.sort || "relevance"}
              onChange={(event) => onPatch({ sort: event.target.value, page: 1 })}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={`sort-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0e62d8] px-6 text-[14px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(14,98,216,0.6)] transition hover:bg-[#0c4fb0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            Buscar ofertas
          </button>
        </form>
      </div>
    </div>
  );
}
