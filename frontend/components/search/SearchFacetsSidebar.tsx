"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdsFacetsResponse, AdsSearchFilters } from "../../lib/search/ads-search";

interface SearchFacetsSidebarProps {
  facets: AdsFacetsResponse["facets"] | null;
  filters: AdsSearchFilters;
  onChange: (patch: Partial<AdsSearchFilters>) => void;
  lockedKeys?: Array<keyof AdsSearchFilters>;
}

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#edf1f6] pb-5 last:border-b-0 last:pb-0">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-extrabold text-[#2a3348]">{title}</h3>
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#6b7488]" fill="currentColor">
          <path d="m5 7 5 6 5-6H5Z" />
        </svg>
      </div>
      {children}
    </section>
  );
}

function InputSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
}: {
  value?: string | number;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-[54px] w-full rounded-xl border border-[#d8dee9] bg-white px-4 text-[15px] font-medium text-[#2f3a54] outline-none transition focus:border-[#0e62d8] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
    >
      <option value="">{placeholder}</option>
      {options.map((item) => (
        <option key={`${item.value}-${item.label}`} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-between rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-[#edf4ff] text-[#0e62d8]" : "bg-[#f5f7fb] text-[#475569] hover:bg-[#edf1f7]"
      }`}
    >
      {children}
    </button>
  );
}

export function SearchFacetsSidebar({
  facets,
  filters,
  onChange,
  lockedKeys = [],
}: SearchFacetsSidebarProps) {
  const locked = useMemo(() => new Set<keyof AdsSearchFilters>(lockedKeys), [lockedKeys]);

  const [brandValue, setBrandValue] = useState(filters.brand || "");
  const [modelValue, setModelValue] = useState(filters.model || "");
  const [maxPrice, setMaxPrice] = useState(filters.max_price?.toString() || "");
  const [cityValue, setCityValue] = useState(filters.city || "São Paulo - SP");

  useEffect(() => {
    setBrandValue(filters.brand || "");
    setModelValue(filters.model || "");
    setMaxPrice(filters.max_price?.toString() || "");
    setCityValue(filters.city || "São Paulo - SP");
  }, [filters.brand, filters.model, filters.max_price, filters.city]);

  const topBrands = useMemo(() => facets?.brands?.slice(0, 6) || [], [facets]);
  const topModels = useMemo(() => {
    if (!facets?.models) return [];
    if (!filters.brand) return facets.models.slice(0, 8);
    return facets.models
      .filter((item) => String(item.brand).toLowerCase() === String(filters.brand).toLowerCase())
      .slice(0, 8);
  }, [facets, filters.brand]);

  const brandOptions = useMemo(
    () => topBrands.map((item) => ({ label: item.brand, value: item.brand })),
    [topBrands]
  );

  const modelOptions = useMemo(
    () => topModels.map((item) => ({ label: item.model, value: item.model })),
    [topModels]
  );

  const priceOptions = [
    { label: "Até R$ 50 mil", value: "50000" },
    { label: "Até R$ 80 mil", value: "80000" },
    { label: "Até R$ 120 mil", value: "120000" },
    { label: "Até R$ 180 mil", value: "180000" },
    { label: "Até R$ 250 mil", value: "250000" },
  ];

  const popularBrands = topBrands.slice(0, 3);
  const popularBrandsGrid = topBrands.slice(0, 6);

  return (
    <aside className="rounded-[24px] border border-[#e1e7f0] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <Section title="Filtros rápidos">
        <div className="space-y-3">
          {!locked.has("brand") && (
            <InputSelect
              value={brandValue}
              onChange={(value) => {
                setBrandValue(value);
                setModelValue("");
                onChange({ brand: value || undefined, model: undefined, page: 1 });
              }}
              placeholder="Marca"
              options={brandOptions}
            />
          )}

          {!locked.has("model") && (
            <InputSelect
              value={modelValue}
              onChange={(value) => {
                setModelValue(value);
                onChange({ model: value || undefined, page: 1 });
              }}
              placeholder="Modelo"
              options={modelOptions}
              disabled={!brandValue && modelOptions.length === 0}
            />
          )}

          <InputSelect
            value={maxPrice}
            onChange={(value) => {
              setMaxPrice(value);
              onChange({ max_price: value ? parseNumberInput(value) : undefined, page: 1 });
            }}
            placeholder="Preço até"
            options={priceOptions}
          />

          <div className="grid grid-cols-2 gap-2 rounded-full bg-[#f1f3f8] p-1">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-full bg-white text-sm font-bold text-[#273248] shadow-sm"
            >
              🚗 Carros
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-full text-sm font-bold text-[#7a8398]"
            >
              🏍 Motos
            </button>
          </div>
        </div>
      </Section>

      <Section title="Localização">
        <InputSelect
          value={cityValue}
          onChange={(value) => {
            setCityValue(value);
            onChange({ city: value || undefined, page: 1 });
          }}
          placeholder="São Paulo - SP"
          options={[
            { label: "São Paulo - SP", value: "São Paulo - SP" },
            { label: "Campinas - SP", value: "Campinas - SP" },
            { label: "Atibaia - SP", value: "Atibaia - SP" },
            { label: "Sorocaba - SP", value: "Sorocaba - SP" },
          ]}
        />
      </Section>

      <Section title="O que te interessa ver hoje?">
        <div className="space-y-2">
          <PillButton
            onClick={() => onChange({ sort: "year_desc", page: 1 })}
            active={filters.sort === "year_desc"}
          >
            <span>Mais novo</span>
            <span className="ml-4 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#7b8498]">
              {(facets?.brands?.reduce((acc, item) => acc + item.total, 0) || 0).toLocaleString(
                "pt-BR"
              )}
            </span>
          </PillButton>

          <PillButton
            onClick={() => onChange({ sort: "price_asc", page: 1 })}
            active={filters.sort === "price_asc"}
          >
            <span>Mais barato</span>
            <span className="ml-4 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#7b8498]">
              130
            </span>
          </PillButton>

          <PillButton
            onClick={() => onChange({ sort: "mileage_asc", page: 1 })}
            active={filters.sort === "mileage_asc"}
          >
            <span>Menos rodado</span>
            <span className="ml-4 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#7b8498]">
              935
            </span>
          </PillButton>
        </div>
      </Section>

      <Section title="Populares">
        <div className="space-y-3">
          {popularBrands.map((item) => (
            <button
              key={item.brand}
              type="button"
              onClick={() => onChange({ brand: item.brand, model: undefined, page: 1 })}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-[#f8fafc]"
            >
              <span className="text-[15px] font-semibold text-[#334155]">{item.brand}</span>
              <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-bold text-[#7a8398]">
                {item.total.toLocaleString("pt-BR")}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Marcas populares">
        <div className="grid grid-cols-3 gap-3">
          {popularBrandsGrid.map((item) => (
            <button
              key={item.brand}
              type="button"
              onClick={() => onChange({ brand: item.brand, model: undefined, page: 1 })}
              className={`rounded-2xl border p-3 text-center transition ${
                filters.brand === item.brand
                  ? "border-[#0e62d8] bg-[#edf4ff]"
                  : "border-[#e3e9f2] bg-[#fafbfd] hover:bg-white"
              }`}
            >
              <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
                <span className="text-sm font-black text-[#556176]">
                  {item.brand.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="mt-2 text-xs font-bold text-[#334155]">{item.brand}</div>
            </button>
          ))}
        </div>
      </Section>
    </aside>
  );
}
