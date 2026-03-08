"use client";

import type { AdsSearchFilters } from "../../lib/search/ads-search";

interface SearchSortSelectProps {
  value?: string;
  onChange: (patch: Partial<AdsSearchFilters>) => void;
}

const SORT_OPTIONS = [
  { value: "relevance", label: "Mais relevantes" },
  { value: "recent", label: "Mais recentes" },
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "year_desc", label: "Mais novos" },
  { value: "year_asc", label: "Mais antigos" },
  { value: "mileage_asc", label: "Menor km" },
  { value: "mileage_desc", label: "Maior km" },
  { value: "highlight", label: "Em destaque" },
];

export function SearchSortSelect({
  value = "relevance",
  onChange,
}: SearchSortSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="search-sort"
        className="text-sm font-medium text-zinc-600"
      >
        Ordenar por
      </label>

      <select
        id="search-sort"
        value={value}
        onChange={(event) =>
          onChange({
            sort: event.target.value,
            page: 1,
          })
        }
        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-500"
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
