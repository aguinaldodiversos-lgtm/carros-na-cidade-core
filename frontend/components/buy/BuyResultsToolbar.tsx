"use client";

import { useState } from "react";
import type { AdsSearchFilters } from "@/lib/search/ads-search";

type BuyResultsToolbarProps = {
  filters: AdsSearchFilters;
  totalResults: number;
  cityLabel: string;
  onChange: (patch: Partial<AdsSearchFilters>) => void;
};

const SORT_OPTIONS = [
  { value: "recent", label: "Ultimos" },
  { value: "relevance", label: "Mais relevantes" },
  { value: "price_asc", label: "Menor preco" },
  { value: "price_desc", label: "Maior preco" },
  { value: "year_desc", label: "Mais novos" },
  { value: "mileage_asc", label: "Menor km" },
  { value: "highlight", label: "Em destaque" },
];

export default function BuyResultsToolbar({
  filters,
  totalResults,
  cityLabel,
  onChange,
}: BuyResultsToolbarProps) {
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");

  return (
    <section className="rounded-[24px] border border-[#dbe4f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-12 min-w-[160px] rounded-xl border border-[#d8dee9] bg-white px-4 text-sm font-semibold text-[#2f3a54] outline-none transition focus:border-[#0e62d8]"
            value={String(filters.limit || 18)}
            onChange={(event) =>
              onChange({
                limit: Number(event.target.value),
                page: 1,
              })
            }
          >
            <option value="18">18 por pagina</option>
            <option value="24">24 por pagina</option>
            <option value="36">36 por pagina</option>
          </select>

          <div className="inline-flex min-h-12 items-center rounded-xl bg-[#f6f8fc] px-4 text-sm font-semibold text-[#415068]">
            Estoque em {cityLabel}
          </div>

          <div className="inline-flex min-h-12 items-center rounded-xl bg-[#eef4ff] px-4 text-sm font-bold text-[#0e62d8]">
            {totalResults.toLocaleString("pt-BR")} anuncios
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-[#6b7488]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6h15M6 12h10M6 18h6M3 6h.01M3 12h.01M3 18h.01" />
            </svg>

            <select
              value={filters.sort || "recent"}
              onChange={(event) =>
                onChange({
                  sort: event.target.value,
                  page: 1,
                })
              }
              className="h-12 rounded-xl border border-[#d8dee9] bg-white px-4 text-sm font-semibold text-[#2f3a54] outline-none transition focus:border-[#0e62d8]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center rounded-xl border border-[#dbe4f0] bg-[#f7f9fc] p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`inline-flex h-10 items-center rounded-[10px] px-3 text-sm font-bold transition ${
                viewMode === "grid"
                  ? "bg-white text-[#233149] shadow-sm"
                  : "text-[#66748b]"
              }`}
            >
              Grade
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={`inline-flex h-10 items-center rounded-[10px] px-3 text-sm font-bold transition ${
                viewMode === "map"
                  ? "bg-white text-[#233149] shadow-sm"
                  : "text-[#66748b]"
              }`}
            >
              Lista
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#dbe4f0] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z" />
              <circle cx="12" cy="11" r="2.25" />
            </svg>
            Ver no mapa
          </button>
        </div>
      </div>
    </section>
  );
}
