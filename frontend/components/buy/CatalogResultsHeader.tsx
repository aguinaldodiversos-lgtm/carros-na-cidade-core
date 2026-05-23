"use client";

import { useCallback, type ChangeEvent } from "react";

import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { formatTotal } from "@/lib/buy/catalog-helpers";

/**
 * Linha "4.256 ofertas encontradas / Ordenar por: Mais relevantes"
 * que aparece entre a action bar (mobile) / sidebar (desktop) e o
 * grid de cards. Extraída do `CatalogPageHeader` no refator
 * 2026-05-22 — o header ficou só com breadcrumb/H1/busca, e a
 * contagem + sort migraram para perto do grid (mockup desktop e
 * celular ambos mostram este pareamento logo acima do primeiro
 * card).
 *
 * Não inclui chips de filtros aplicados, microcopy "Sem filtros
 * avançados aplicados", select de Estado nem CTAs de ampliação
 * territorial — esses elementos foram removidos da página inteira
 * conforme briefing 2026-05-22 (regra: complexidade dentro dos
 * filtros, simplicidade na vitrine).
 */

const SORT_OPTIONS = [
  { value: "relevance", label: "Mais relevantes" },
  { value: "recent", label: "Recém-publicados" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "year_desc", label: "Mais novo" },
  { value: "mileage_asc", label: "Menos km" },
];

export type CatalogResultsHeaderProps = {
  totalResults: number;
  sort?: string;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  /**
   * Hide the sort `<select>` (mobile shows it via the "Ordenar" action
   * bar bottom-sheet instead, to free horizontal space). Default false.
   */
  hideSort?: boolean;
};

export function CatalogResultsHeader({
  totalResults,
  sort,
  onPatch,
  hideSort = false,
}: CatalogResultsHeaderProps) {
  const handleSortChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onPatch({ sort: event.target.value, page: 1 });
    },
    [onPatch]
  );

  return (
    <div
      data-testid="catalog-results-header"
      className="flex items-center justify-between gap-3 pb-3 pt-1 text-sm sm:pb-4"
    >
      <p className="text-cnc-muted sm:text-[15px]">
        <strong className="tabular-nums text-cnc-text-strong">{formatTotal(totalResults)}</strong>{" "}
        ofertas encontradas
      </p>

      {hideSort ? null : (
        <label className="inline-flex items-center gap-2 text-cnc-muted">
          <span className="hidden sm:inline">Ordenar por:</span>
          <select
            aria-label="Ordenar por"
            value={sort || "relevance"}
            onChange={handleSortChange}
            className="rounded-lg border border-transparent bg-transparent py-1 pl-1 pr-6 text-sm font-semibold text-primary outline-none transition hover:border-cnc-line focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export const CATALOG_SORT_OPTIONS = SORT_OPTIONS;
