import Link from "next/link";

import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { formatTotal } from "@/lib/buy/catalog-helpers";
import { DEFAULT_COMPRAR_CATALOG_LIMIT } from "@/lib/search/ads-search-url";

type ResultsToolbarProps = {
  filters: AdsSearchFilters;
  totalResults: number;
  cityLabel: string;
  mapHref: string;
  onLimitChange: (limit: number) => void;
  onSortChange: (value: string) => void;
};

export function ResultsToolbar({
  filters,
  totalResults,
  cityLabel,
  mapHref,
  onLimitChange,
  onSortChange,
}: ResultsToolbarProps) {
  const limit = filters.limit ?? DEFAULT_COMPRAR_CATALOG_LIMIT;

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-5">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-h-[2.75rem] flex-wrap items-center gap-2">
          <span className="hidden text-[13px] font-semibold text-slate-500 sm:inline">Mostrar</span>
          <label htmlFor="buy-result-limit" className="sr-only">
            Quantidade de resultados por página
          </label>
          <select
            id="buy-result-limit"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="h-11 min-w-[8.5rem] rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-[13px] font-semibold text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
          >
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
          </select>
        </div>

        <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />

        <p className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-sm text-slate-600">
          <span className="font-bold tabular-nums text-slate-900">{formatTotal(totalResults)}</span>
          <span className="text-slate-500">resultados em</span>
          <span className="truncate font-semibold text-slate-800">{cityLabel}</span>
        </p>
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
        <label htmlFor="buy-sort" className="sr-only">
          Ordenação
        </label>
        <select
          id="buy-sort"
          value={filters.sort || "recent"}
          onChange={(event) => onSortChange(event.target.value)}
          className="h-11 w-full min-w-[12rem] rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 sm:w-auto"
        >
          <option value="recent">Últimos anúncios</option>
          <option value="relevance">Relevância</option>
          <option value="year_desc">Mais novo</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
          <option value="mileage_asc">Menos km</option>
          <option value="highlight">Em destaque</option>
        </select>

        <Link
          href={mapHref}
          className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-[13px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white sm:w-auto"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 text-slate-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M4 10.5 12 4l8 6.5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
            <path d="M9 14h6" />
          </svg>
          Ver no mapa
        </Link>
      </div>
    </div>
  );
}
