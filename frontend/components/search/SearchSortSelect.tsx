"use client";

import type { AdsSearchFilters } from "../../lib/search/ads-search";

interface SearchSortSelectProps {
  value?: string;
  onChange: (patch: Partial<AdsSearchFilters>) => void;
}

const SORT_OPTIONS = [
  { value: "recent", label: "Últimos" },
  { value: "relevance", label: "Mais relevantes" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "year_desc", label: "Mais novos" },
  { value: "mileage_asc", label: "Menor km" },
  { value: "highlight", label: "Em destaque" },
];

export function SearchSortSelect({
  value = "recent",
  onChange,
}: SearchSortSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#6b7488]" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 6h15M6 12h10M6 18h6M3 6h.01M3 12h.01M3 18h.01" />
      </svg>

      <select
        value={value}
        onChange={(event) =>
          onChange({
            sort: event.target.value,
            page: 1,
          })
        }
        className="h-11 rounded-xl border border-[#d8dee9] bg-white px-4 text-sm font-semibold text-[#2f3a54] outline-none transition focus:border-[#0e62d8]"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
