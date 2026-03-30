"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdsFacetsResponse, AdsSearchFilters } from "@/lib/search/ads-search";

type BuyFiltersSidebarProps = {
  facets: AdsFacetsResponse["facets"] | null;
  filters: AdsSearchFilters;
  totalResults: number;
  cityLabel: string;
  onChange: (patch: Partial<AdsSearchFilters>) => void;
  onClearAll: () => void;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[16px] font-extrabold text-[#1f2739] sm:text-[18px]">{children}</h3>;
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[#eef2f8] px-3 py-1 text-[12px] font-bold text-[#616d87]">
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-b border-[#e6ebf3] p-5 last:border-b-0">
      <div className="flex items-center justify-between">
        <SectionTitle>{title}</SectionTitle>
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#6c7890]" fill="currentColor">
          <path d="m5 7 5 6 5-6H5Z" />
        </svg>
      </div>
      {children}
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-bold text-[#2f3953]">{label}</span>
      <select
        className="h-[50px] w-full rounded-xl border border-[#d8e0ec] bg-white px-4 text-[15px] font-semibold text-[#37425d] outline-none transition focus:border-[#0e62d8] disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-[14px] font-semibold transition ${
        active ? "bg-[#edf4ff] text-[#0e62d8]" : "bg-[#f7f9fc] text-[#334155] hover:bg-[#eef3f8]"
      }`}
    >
      {children}
    </button>
  );
}

function parseLocationValue(value: string) {
  const [city, state] = value
    .split(" - ")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    city: city || undefined,
    state: state || undefined,
  };
}

export default function BuyFiltersSidebar({
  facets,
  filters,
  totalResults,
  cityLabel,
  onChange,
  onClearAll,
}: BuyFiltersSidebarProps) {
  const [brandValue, setBrandValue] = useState(filters.brand || "");
  const [modelValue, setModelValue] = useState(filters.model || "");
  const [priceValue, setPriceValue] = useState(filters.max_price?.toString() || "");
  const [locationValue, setLocationValue] = useState(filters.city || cityLabel);
  const [highlightOnly, setHighlightOnly] = useState(Boolean(filters.highlight_only));
  const [belowFipeOnly, setBelowFipeOnly] = useState(Boolean(filters.below_fipe));

  useEffect(() => {
    setBrandValue(filters.brand || "");
    setModelValue(filters.model || "");
    setPriceValue(filters.max_price?.toString() || "");
    setLocationValue(filters.city || cityLabel);
    setHighlightOnly(Boolean(filters.highlight_only));
    setBelowFipeOnly(Boolean(filters.below_fipe));
  }, [
    cityLabel,
    filters.brand,
    filters.model,
    filters.max_price,
    filters.city,
    filters.highlight_only,
    filters.below_fipe,
  ]);

  const topBrands = useMemo(() => facets?.brands?.slice(0, 6) || [], [facets]);
  const modelOptions = useMemo(() => {
    if (!facets?.models) return [];

    return facets.models
      .filter((item) => !brandValue || item.brand === brandValue)
      .slice(0, 12)
      .map((item) => ({ label: item.model, value: item.model }));
  }, [facets, brandValue]);

  const brandOptions = useMemo(
    () => topBrands.map((item) => ({ label: item.brand, value: item.brand })),
    [topBrands]
  );

  const popularBrandGrid = topBrands.slice(0, 6);

  function applyFilters() {
    const location = parseLocationValue(locationValue);
    const nextCity =
      location.city && location.state ? `${location.city} - ${location.state}` : location.city;
    const keepCurrentSlug = Boolean(filters.city_slug && locationValue === cityLabel);

    onChange({
      brand: brandValue || undefined,
      model: modelValue || undefined,
      max_price: priceValue ? Number(priceValue) : undefined,
      city_slug: keepCurrentSlug ? filters.city_slug : undefined,
      city_id: keepCurrentSlug ? filters.city_id : undefined,
      city: nextCity,
      state: location.state,
      highlight_only: highlightOnly || undefined,
      below_fipe: belowFipeOnly || undefined,
      page: 1,
    });
  }

  function clearFilters() {
    setBrandValue("");
    setModelValue("");
    setPriceValue("");
    setLocationValue(cityLabel);
    setHighlightOnly(false);
    setBelowFipeOnly(false);
    onClearAll();
  }

  return (
    <aside className="overflow-hidden rounded-[18px] border border-[#dbe4f0] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#e6ebf3] bg-[#fbfcfe] px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#0e62d8]">
              Filtros
            </p>
            <p className="mt-1 text-sm text-[#5f6c84]">
              Refinar estoque local com foco em {cityLabel}.
            </p>
          </div>
          <CountPill>{totalResults.toLocaleString("pt-BR")}</CountPill>
        </div>
      </div>

      <Section title="Filtros rapidos">
        <div className="space-y-3">
          <SelectField
            label="Marca"
            value={brandValue}
            onChange={(value) => {
              setBrandValue(value);
              if (!value) setModelValue("");
            }}
            options={brandOptions}
            placeholder="Selecione a marca"
          />

          <SelectField
            label="Modelo"
            value={modelValue}
            onChange={setModelValue}
            options={modelOptions}
            placeholder="Selecione o modelo"
            disabled={!brandValue && modelOptions.length === 0}
          />

          <SelectField
            label="Preco ate"
            value={priceValue}
            onChange={setPriceValue}
            options={[
              { label: "Ate R$ 50 mil", value: "50000" },
              { label: "Ate R$ 80 mil", value: "80000" },
              { label: "Ate R$ 120 mil", value: "120000" },
              { label: "Ate R$ 180 mil", value: "180000" },
              { label: "Ate R$ 250 mil", value: "250000" },
            ]}
            placeholder="Faixa de preco"
          />

          <div className="rounded-full bg-[#edf1f7] p-1">
            <div className="grid grid-cols-2 gap-1 text-center">
              <button
                type="button"
                className="rounded-full bg-white py-2 text-[14px] font-bold text-[#28324b] shadow-sm"
              >
                Carros
              </button>
              <button
                type="button"
                className="rounded-full py-2 text-[14px] font-bold text-[#7a8499]"
              >
                Motos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setHighlightOnly((current) => !current)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                highlightOnly
                  ? "border-[#0e62d8] bg-[#edf4ff] text-[#0e62d8]"
                  : "border-[#dde4ef] bg-white text-[#506078]"
              }`}
            >
              Destaque
            </button>
            <button
              type="button"
              onClick={() => setBelowFipeOnly((current) => !current)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                belowFipeOnly
                  ? "border-[#0e62d8] bg-[#edf4ff] text-[#0e62d8]"
                  : "border-[#dde4ef] bg-white text-[#506078]"
              }`}
            >
              Abaixo da FIPE
            </button>
          </div>
        </div>
      </Section>

      <Section title="Localizacao">
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#e4eaf2] bg-[#f8fafc] p-3 text-sm leading-6 text-[#5f6c84]">
            Identificamos a sua localizacao para mostrar melhores oportunidades perto de voce.
          </div>

          <SelectField
            label="Cidade ativa"
            value={locationValue}
            onChange={setLocationValue}
            options={[
              { label: cityLabel, value: cityLabel },
              { label: "Sao Paulo - SP", value: "Sao Paulo - SP" },
              { label: "Campinas - SP", value: "Campinas - SP" },
              { label: "Santos - SP", value: "Santos - SP" },
              { label: "Sorocaba - SP", value: "Sorocaba - SP" },
            ]}
            placeholder="Selecione a cidade"
          />
        </div>
      </Section>

      <Section title="O que te interessa ver hoje?">
        <div className="space-y-2">
          <QuickButton
            active={filters.sort === "year_desc"}
            onClick={() => onChange({ sort: "year_desc", page: 1 })}
          >
            <span>Mais novo</span>
            <CountPill>{totalResults.toLocaleString("pt-BR")}</CountPill>
          </QuickButton>

          <QuickButton
            active={filters.sort === "price_asc"}
            onClick={() => onChange({ sort: "price_asc", page: 1 })}
          >
            <span>Mais barato</span>
            <CountPill>{totalResults.toLocaleString("pt-BR")}</CountPill>
          </QuickButton>

          <QuickButton
            active={filters.sort === "mileage_asc"}
            onClick={() => onChange({ sort: "mileage_asc", page: 1 })}
          >
            <span>Menos rodado</span>
            <CountPill>{totalResults.toLocaleString("pt-BR")}</CountPill>
          </QuickButton>
        </div>
      </Section>

      <Section title="Populares">
        <div className="space-y-2">
          {topBrands.slice(0, 3).map((item) => (
            <button
              key={item.brand}
              type="button"
              onClick={() => onChange({ brand: item.brand, model: undefined, page: 1 })}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-[#f7f9fc]"
            >
              <span className="text-[15px] font-semibold text-[#334155]">{item.brand}</span>
              <CountPill>{item.total.toLocaleString("pt-BR")}</CountPill>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Marcas populares">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {popularBrandGrid.map((item) => (
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
              <div className="mt-2 text-[11px] font-bold text-[#334155] sm:text-xs">
                {item.brand}
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Contexto regional">
        <div className="space-y-2 text-sm text-[#4f5d75]">
          <div className="rounded-2xl border border-[#e4eaf2] bg-[#fafbfd] p-3">
            Estoque preparado para variacoes territoriais e navegacao local por cidade.
          </div>
          <div className="rounded-2xl border border-[#e4eaf2] bg-[#fafbfd] p-3">
            Estrutura pronta para marcas, modelos e oportunidades regionais.
          </div>
        </div>
      </Section>

      <div className="grid gap-3 p-5">
        <button
          type="button"
          onClick={applyFilters}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-bold text-white shadow-[0_10px_20px_rgba(14,98,216,0.18)] transition hover:bg-[#0c54bc]"
        >
          Aplicar busca
        </button>

        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex h-12 items-center justify-center rounded-xl border border-[#dbe4f0] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:bg-[#f8fbff]"
        >
          Limpar filtros
        </button>
      </div>
    </aside>
  );
}
