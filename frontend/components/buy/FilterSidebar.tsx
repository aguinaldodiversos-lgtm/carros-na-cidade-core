"use client";

import type { AdsSearchFilters } from "@/lib/search/ads-search";
import type { BrandFacet, BuyCityContext } from "@/lib/buy/catalog-helpers";
import { formatTotal } from "@/lib/buy/catalog-helpers";

import { FilterSection } from "./FilterSection";

type SelectOption = { label: string; value: string };

type FilterSidebarProps = {
  filters: AdsSearchFilters;
  city: BuyCityContext;
  brandOptions: SelectOption[];
  modelOptions: SelectOption[];
  popularBrands: BrandFacet[];
  catalogStats: { newest: number; cheaper: number; lessMileage: number };
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  className?: string;
};

function FilterSelect({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-slate-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
      >
        {options.map((option) => (
          <option key={`${id}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function QuickInterestRow({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50"
    >
      <span className="text-[14px] font-semibold text-slate-800">{label}</span>
      <span className="inline-flex min-w-[3rem] items-center justify-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-500">
        {formatTotal(count)}
      </span>
    </button>
  );
}

function BrandBadge({ label, onClick }: { label: string; onClick: () => void }) {
  const initial = label.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-slate-200/90 bg-white px-1.5 py-2.5 text-center shadow-sm transition hover:border-blue-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-sm font-extrabold text-blue-800">
        {initial}
      </div>
      <div className="mt-1.5 truncate text-[11px] font-bold text-slate-800">{label}</div>
    </button>
  );
}

export function FilterSidebar({
  filters,
  city,
  brandOptions,
  modelOptions,
  popularBrands,
  catalogStats,
  onPatch,
  className = "",
}: FilterSidebarProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/90 bg-white p-1 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] ${className}`}
    >
      <div className="border-b border-slate-100 px-4 pb-3 pt-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Refinar busca</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">Filtros</p>
      </div>

      <div className="px-4 pb-4">
        <FilterSection title="Filtros rápidos" id="ff-quick">
          <FilterSelect
            id="ff-brand"
            label="Marca"
            value={filters.brand || ""}
            options={brandOptions}
            onChange={(value) => onPatch({ brand: value || undefined, model: undefined })}
          />
          <FilterSelect
            id="ff-model"
            label="Modelo"
            value={filters.model || ""}
            options={modelOptions}
            onChange={(value) => onPatch({ model: value || undefined })}
          />
          <FilterSelect
            id="ff-price"
            label="Preço até"
            value={String(filters.max_price || "")}
            options={[
              { label: "Faixa de preço", value: "" },
              { label: "Até R$ 60.000", value: "60000" },
              { label: "Até R$ 80.000", value: "80000" },
              { label: "Até R$ 100.000", value: "100000" },
              { label: "Até R$ 150.000", value: "150000" },
              { label: "Até R$ 200.000", value: "200000" },
            ]}
            onChange={(value) => onPatch({ max_price: value ? Number(value) : undefined })}
          />

          <div>
            <span className="mb-2 block text-[13px] font-semibold text-slate-700">Tipo</span>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
              <span className="inline-flex h-10 items-center justify-center rounded-lg bg-white text-[13px] font-bold text-slate-900 shadow-sm ring-1 ring-slate-200/80">
                Carros
              </span>
              <span
                className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-lg text-[13px] font-medium text-slate-400"
                title="Em breve"
              >
                Motos
              </span>
            </div>
          </div>
        </FilterSection>

        <FilterSection title="Localização" id="ff-loc">
          <FilterSelect
            id="ff-city"
            label="Cidade ativa"
            value={city.slug}
            options={[{ label: city.label, value: city.slug }]}
            onChange={() => undefined}
          />
          <p className="text-xs leading-relaxed text-slate-500">
            Troque a cidade pelo seletor no topo do site para ver anúncios em outra região.
          </p>
        </FilterSection>

        <FilterSection title="O que te interessa ver hoje?" id="ff-interest" defaultOpen>
          <div className="space-y-0.5 rounded-xl border border-slate-100 bg-slate-50/50 p-1">
            <QuickInterestRow
              label="Mais novo"
              count={catalogStats.newest}
              onClick={() => onPatch({ sort: "year_desc" })}
            />
            <QuickInterestRow
              label="Mais barato"
              count={catalogStats.cheaper}
              onClick={() => onPatch({ sort: "price_asc" })}
            />
            <QuickInterestRow
              label="Menos rodado"
              count={catalogStats.lessMileage}
              onClick={() => onPatch({ sort: "mileage_asc" })}
            />
          </div>
        </FilterSection>

        <FilterSection title="Populares" id="ff-pop">
          <div className="space-y-1">
            {popularBrands.slice(0, 3).map((item) => (
              <button
                key={item.brand}
                type="button"
                onClick={() => onPatch({ brand: item.brand })}
                className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-50"
              >
                <span className="text-[14px] font-semibold text-slate-800">{item.brand}</span>
                <span className="text-[13px] font-bold tabular-nums text-slate-400">
                  {formatTotal(item.total)}
                </span>
              </button>
            ))}
          </div>
        </FilterSection>

        <FilterSection title="Marcas populares" id="ff-brands" defaultOpen>
          <div className="grid grid-cols-3 gap-2">
            {popularBrands.map((item) => (
              <BrandBadge
                key={`popular-${item.brand}`}
                label={item.brand}
                onClick={() => onPatch({ brand: item.brand })}
              />
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
}
