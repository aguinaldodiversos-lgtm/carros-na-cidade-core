"use client";

import { useState } from "react";

import { useNearbyRegionRedirect } from "@/hooks/useNearbyRegionRedirect";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { CATALOG_SORT_OPTIONS } from "@/components/buy/CatalogResultsHeader";
import type { ComprarVariant } from "@/lib/buy/territory-variant";

/**
 * Barra mobile com 3 botões grandes brancos com borda leve:
 *   1. CTA territorial (label varia por variant — ver tabela abaixo)
 *   2. Ordenar     — abre bottom-sheet com as opções de sort
 *   3. Filtrar     — chama `onOpenFilters()` (a sheet existente fica em
 *                    `BuyMarketplacePageClient` para reaproveitar o
 *                    state `mobileFiltersOpen` + a `FilterSidebar` que
 *                    já vive lá)
 *
 * Briefing 2026-05-22 (mockup `atualização_catalogo_celular.png`):
 *   "A parte mais importante da versão celular é a barra com apenas
 *    três ações: Ver perto · Ordenar · Filtrar."
 *
 * Briefing 2026-05-23 — labels do CTA territorial por variant (jornada
 * Estadual → Regional → Cidade → Regional):
 *
 *   ▸ estadual:  "Ver perto"        — geo → Regional do visitante
 *   ▸ regional:  "Minha região"     — geo → Regional do visitante
 *                                     (re-localiza quando caiu numa
 *                                     região errada pelo Google)
 *   ▸ cidade:    "Ver perto"        — geo → Regional do visitante. O antigo
 *                                     link direto "Ver na região" foi removido
 *                                     (a Região deu lugar ao filtro de
 *                                     Distância na sidebar — âncora regional).
 *
 * Visualmente mobile-only (`lg:hidden`). Substitui o FAB flutuante
 * "Filtros" que existia no `BuyMarketplacePageClient` antes do refator.
 */

type CatalogActionBarProps = {
  filters: AdsSearchFilters;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  regionalEnabled: boolean;
  onOpenFilters: () => void;
  variant?: ComprarVariant;
};

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 text-cnc-text-strong"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M7 5v14M3 9l4-4 4 4" />
      <path d="M17 19V5M21 15l-4 4-4-4" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 text-cnc-text-strong"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

const ACTION_BUTTON =
  "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-cnc-line bg-cnc-surface px-3 py-3 text-sm font-semibold text-cnc-text-strong shadow-sm transition hover:border-primary/40 hover:text-primary active:scale-[0.98]";

export function CatalogActionBar({
  filters,
  onPatch,
  regionalEnabled,
  onOpenFilters,
  variant = "estadual",
}: CatalogActionBarProps) {
  const { trigger, state } = useNearbyRegionRedirect({ regionalEnabled });
  const [sortOpen, setSortOpen] = useState(false);

  const locating = state.kind === "locating" || state.kind === "redirecting";

  // Todas as variants (inclusive cidade): geo → Regional do visitante. O antigo
  // link direto de região (variant cidade) foi removido — a Região virou o
  // filtro de Distância na sidebar. Labels por variant — ver doc no topo.
  const ctaLabel = locating ? "Localizando…" : variant === "regional" ? "Minha região" : "Ver perto";
  const ctaAriaLabel =
    variant === "regional" ? "Ver carros em minha região" : "Ver carros perto de mim";

  return (
    <div data-testid="catalog-action-bar" className="lg:hidden">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={trigger}
          disabled={locating}
          className={ACTION_BUTTON}
          aria-label={ctaAriaLabel}
          data-testid="catalog-action-bar-cta"
        >
          <PinIcon />
          <span>{ctaLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => setSortOpen(true)}
          className={ACTION_BUTTON}
          aria-haspopup="dialog"
        >
          <SortIcon />
          <span>Ordenar</span>
        </button>

        <button
          type="button"
          onClick={onOpenFilters}
          className={ACTION_BUTTON}
          aria-haspopup="dialog"
        >
          <FilterIcon />
          <span>Filtrar</span>
        </button>
      </div>

      {sortOpen ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Ordenar resultados"
        >
          <button
            type="button"
            className="absolute inset-0 bg-cnc-text-strong/50 backdrop-blur-[2px]"
            aria-label="Fechar"
            onClick={() => setSortOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-cnc-surface shadow-premium-lg">
            <div className="flex items-center justify-between border-b border-cnc-line px-4 py-3">
              <span className="text-base font-bold text-cnc-text-strong">Ordenar por</span>
              <button
                type="button"
                onClick={() => setSortOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-primary"
              >
                Fechar
              </button>
            </div>
            <ul className="max-h-[60vh] divide-y divide-cnc-line overflow-y-auto">
              {CATALOG_SORT_OPTIONS.map((opt) => {
                const active = (filters.sort || "relevance") === opt.value;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onPatch({ sort: opt.value, page: 1 });
                        setSortOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-cnc-bg"
                      aria-pressed={active}
                    >
                      <span className={active ? "font-bold text-primary" : "text-cnc-text"}>
                        {opt.label}
                      </span>
                      {active ? (
                        <span aria-hidden="true" className="text-primary">
                          ●
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
