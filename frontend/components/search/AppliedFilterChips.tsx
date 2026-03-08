"use client";

import type { AdsSearchFilters } from "../../lib/search/ads-search";

interface AppliedFilterChipsProps {
  filters: AdsSearchFilters;
  onRemove: (patch: Partial<AdsSearchFilters>) => void;
  onClearAll: () => void;
}

function formatCurrency(value?: number) {
  if (value === undefined) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AppliedFilterChips({
  filters,
  onRemove,
  onClearAll,
}: AppliedFilterChipsProps) {
  const chips: Array<{
    key: string;
    label: string;
    remove: () => void;
  }> = [];

  if (filters.q) {
    chips.push({
      key: "q",
      label: `Busca: ${filters.q}`,
      remove: () => onRemove({ q: undefined, page: 1 }),
    });
  }

  if (filters.brand) {
    chips.push({
      key: "brand",
      label: `Marca: ${filters.brand}`,
      remove: () => onRemove({ brand: undefined, model: undefined, page: 1 }),
    });
  }

  if (filters.model) {
    chips.push({
      key: "model",
      label: `Modelo: ${filters.model}`,
      remove: () => onRemove({ model: undefined, page: 1 }),
    });
  }

  if (filters.city) {
    chips.push({
      key: "city",
      label: `Cidade: ${filters.city}`,
      remove: () =>
        onRemove({
          city: undefined,
          city_id: undefined,
          city_slug: undefined,
          state: undefined,
          page: 1,
        }),
    });
  }

  if (filters.min_price !== undefined || filters.max_price !== undefined) {
    chips.push({
      key: "price",
      label: `Preço: ${formatCurrency(filters.min_price) || "R$ 0"}${
        filters.max_price !== undefined
          ? ` até ${formatCurrency(filters.max_price)}`
          : " ou mais"
      }`,
      remove: () =>
        onRemove({
          min_price: undefined,
          max_price: undefined,
          page: 1,
        }),
    });
  }

  if (filters.year_min !== undefined || filters.year_max !== undefined) {
    chips.push({
      key: "year",
      label: `Ano: ${filters.year_min || "..." } até ${filters.year_max || "..."}`,
      remove: () =>
        onRemove({
          year_min: undefined,
          year_max: undefined,
          page: 1,
        }),
    });
  }

  if (filters.mileage_max !== undefined) {
    chips.push({
      key: "mileage_max",
      label: `Km até ${filters.mileage_max.toLocaleString("pt-BR")}`,
      remove: () => onRemove({ mileage_max: undefined, page: 1 }),
    });
  }

  if (filters.fuel_type) {
    chips.push({
      key: "fuel_type",
      label: `Combustível: ${filters.fuel_type}`,
      remove: () => onRemove({ fuel_type: undefined, page: 1 }),
    });
  }

  if (filters.transmission) {
    chips.push({
      key: "transmission",
      label: `Câmbio: ${filters.transmission}`,
      remove: () => onRemove({ transmission: undefined, page: 1 }),
    });
  }

  if (filters.body_type) {
    chips.push({
      key: "body_type",
      label: `Carroceria: ${filters.body_type}`,
      remove: () => onRemove({ body_type: undefined, page: 1 }),
    });
  }

  if (filters.below_fipe === true) {
    chips.push({
      key: "below_fipe",
      label: "Abaixo da FIPE",
      remove: () => onRemove({ below_fipe: undefined, page: 1 }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          {chip.label} ×
        </button>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
      >
        Limpar tudo
      </button>
    </div>
  );
}
