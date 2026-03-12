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

/** Collapsible section with ARIA landmark support. */
function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const headingId = `${id}-heading`;
  const regionId = `${id}-region`;

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      className="border-b border-[#edf1f6] pb-5 last:border-b-0 last:pb-0"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 id={headingId} className="text-[15px] font-extrabold text-[#2a3348]">
          {title}
        </h3>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={regionId}
          aria-label={expanded ? `Recolher ${title}` : `Expandir ${title}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#6b7488] transition hover:bg-[#f1f5f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2"
        >
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-0" : "-rotate-90"}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="m5 7 5 6 5-6H5Z" />
          </svg>
        </button>
      </div>
      <div id={regionId} className={expanded ? "" : "hidden"}>
        {children}
      </div>
    </section>
  );
}

/** Styled select with ARIA label and visible focus ring. */
function InputSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
  "aria-label": ariaLabel,
}: {
  value?: string | number;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel ?? placeholder}
      className="h-[54px] w-full cursor-pointer rounded-xl border border-[#d8dee9] bg-white px-4 text-[15px] font-medium text-[#2f3a54] outline-none transition hover:border-[#b0bdd8] focus-visible:border-[#0e62d8] focus-visible:ring-2 focus-visible:ring-[#0e62d8]/20 disabled:cursor-not-allowed disabled:bg-[#f8fafc] disabled:text-[#94a3b8]"
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

/** Full-width pill button with pressed and current-page states. */
function PillButton({
  active,
  onClick,
  children,
  "aria-label": ariaLabel,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`inline-flex w-full items-center justify-between rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2 ${
        active
          ? "border border-[#0e62d8]/20 bg-[#edf4ff] text-[#0e62d8]"
          : "bg-[#f5f7fb] text-[#475569] hover:bg-[#edf1f7] hover:text-[#334155]"
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
  // Local UI state for vehicle type toggle.
  // TODO: Connect to AdsSearchFilters once a `vehicle_type` filter key is added to the API.
  const [vehicleType, setVehicleType] = useState<"car" | "motorcycle">("car");

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

  const totalAds = useMemo(
    () => facets?.brands?.reduce((acc, item) => acc + item.total, 0) ?? 0,
    [facets]
  );

  const popularBrands = topBrands.slice(0, 3);
  const popularBrandsGrid = topBrands.slice(0, 6);

  return (
    <aside
      aria-label="Filtros de busca"
      className="rounded-[24px] border border-[#e1e7f0] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
    >
      <Section title="Filtros rápidos" id="quick-filters">
        <div className="space-y-3">
          {/* Vehicle type toggle */}
          <div
            role="group"
            aria-label="Tipo de veículo"
            className="grid grid-cols-2 gap-2 rounded-full bg-[#f1f3f8] p-1"
          >
            <button
              type="button"
              aria-pressed={vehicleType === "car"}
              onClick={() => setVehicleType("car")}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-1 ${
                vehicleType === "car"
                  ? "bg-white text-[#273248] shadow-sm"
                  : "text-[#7a8398] hover:text-[#475569]"
              }`}
            >
              <span aria-hidden="true">🚗</span>
              Carros
            </button>
            <button
              type="button"
              aria-pressed={vehicleType === "motorcycle"}
              onClick={() => setVehicleType("motorcycle")}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-1 ${
                vehicleType === "motorcycle"
                  ? "bg-white text-[#273248] shadow-sm"
                  : "text-[#7a8398] hover:text-[#475569]"
              }`}
            >
              <span aria-hidden="true">🏍</span>
              Motos
            </button>
          </div>

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
              aria-label="Filtrar por marca"
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
              aria-label="Filtrar por modelo"
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
            aria-label="Filtrar por preço máximo"
          />
        </div>
      </Section>

      <Section title="Localização" id="location">
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
          aria-label="Filtrar por cidade"
        />
      </Section>

      <Section title="O que te interessa ver hoje?" id="sort">
        <div className="space-y-2">
          <PillButton
            onClick={() => onChange({ sort: "year_desc", page: 1 })}
            active={filters.sort === "year_desc"}
            aria-label={`Ordenar por mais novo — ${totalAds.toLocaleString("pt-BR")} anúncios`}
          >
            <span>Mais novo</span>
            <span
              className={`ml-4 rounded-full px-2.5 py-1 text-xs font-bold ${
                filters.sort === "year_desc" ? "bg-white text-[#0e62d8]" : "bg-white text-[#7b8498]"
              }`}
              aria-hidden="true"
            >
              {totalAds.toLocaleString("pt-BR")}
            </span>
          </PillButton>

          <PillButton
            onClick={() => onChange({ sort: "price_asc", page: 1 })}
            active={filters.sort === "price_asc"}
            aria-label="Ordenar por mais barato"
          >
            <span>Mais barato</span>
            {/* Count placeholder — facets API does not expose per-sort totals */}
            <span
              className={`ml-4 rounded-full px-2.5 py-1 text-xs font-bold ${
                filters.sort === "price_asc" ? "bg-white text-[#0e62d8]" : "bg-white text-[#7b8498]"
              }`}
              aria-hidden="true"
            >
              130
            </span>
          </PillButton>

          <PillButton
            onClick={() => onChange({ sort: "mileage_asc", page: 1 })}
            active={filters.sort === "mileage_asc"}
            aria-label="Ordenar por menos rodado"
          >
            <span>Menos rodado</span>
            {/* Count placeholder — facets API does not expose per-sort totals */}
            <span
              className={`ml-4 rounded-full px-2.5 py-1 text-xs font-bold ${
                filters.sort === "mileage_asc" ? "bg-white text-[#0e62d8]" : "bg-white text-[#7b8498]"
              }`}
              aria-hidden="true"
            >
              935
            </span>
          </PillButton>
        </div>
      </Section>

      <Section title="Populares" id="popular-brands-list">
        <div className="space-y-1">
          {popularBrands.map((item) => (
            <button
              key={item.brand}
              type="button"
              onClick={() => onChange({ brand: item.brand, model: undefined, page: 1 })}
              aria-current={filters.brand === item.brand ? "true" : undefined}
              aria-label={`Filtrar por ${item.brand} — ${item.total.toLocaleString("pt-BR")} anúncios`}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2 ${
                filters.brand === item.brand ? "bg-[#edf4ff]" : "hover:bg-[#f8fafc]"
              }`}
            >
              <span
                className={`text-[15px] font-semibold ${
                  filters.brand === item.brand ? "text-[#0e62d8]" : "text-[#334155]"
                }`}
              >
                {item.brand}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  filters.brand === item.brand ? "bg-white text-[#0e62d8]" : "bg-[#f1f5f9] text-[#7a8398]"
                }`}
              >
                {item.total.toLocaleString("pt-BR")}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Marcas populares" id="brands-grid">
        <div className="grid grid-cols-3 gap-3">
          {popularBrandsGrid.map((item) => (
            <button
              key={item.brand}
              type="button"
              onClick={() => onChange({ brand: item.brand, model: undefined, page: 1 })}
              aria-pressed={filters.brand === item.brand}
              aria-label={`${item.brand} — ${item.total.toLocaleString("pt-BR")} anúncios`}
              className={`rounded-2xl border p-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2 ${
                filters.brand === item.brand
                  ? "border-[#0e62d8] bg-[#edf4ff]"
                  : "border-[#e3e9f2] bg-[#fafbfd] hover:border-[#c8d5ea] hover:bg-white"
              }`}
            >
              <div
                className={`mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl shadow-sm transition ${
                  filters.brand === item.brand ? "bg-[#edf4ff]" : "bg-white"
                }`}
              >
                <span
                  className={`text-sm font-black ${
                    filters.brand === item.brand ? "text-[#0e62d8]" : "text-[#556176]"
                  }`}
                >
                  {item.brand.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div
                className={`mt-2 text-xs font-bold ${
                  filters.brand === item.brand ? "text-[#0e62d8]" : "text-[#334155]"
                }`}
              >
                {item.brand}
              </div>
            </button>
          ))}
        </div>
      </Section>
    </aside>
  );
}
