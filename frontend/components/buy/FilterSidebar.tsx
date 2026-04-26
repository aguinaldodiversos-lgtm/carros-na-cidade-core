"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";

import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { formatTotal, type BrandFacet, type BuyCityContext } from "@/lib/buy/catalog-helpers";

type SelectOption = { label: string; value: string };

type FilterSidebarProps = {
  filters: AdsSearchFilters;
  city: BuyCityContext;
  brandOptions: SelectOption[];
  modelOptions: SelectOption[];
  popularBrands: BrandFacet[];
  totalResults: number;
  onPatch: (patch: Partial<AdsSearchFilters>) => void;
  onClear: () => void;
  className?: string;
};

const PRICE_RANGES: SelectOption[] = [
  { label: "Qualquer preço", value: "" },
  { label: "Até R$ 40.000", value: "40000" },
  { label: "Até R$ 60.000", value: "60000" },
  { label: "Até R$ 80.000", value: "80000" },
  { label: "Até R$ 100.000", value: "100000" },
  { label: "Até R$ 150.000", value: "150000" },
  { label: "Até R$ 200.000", value: "200000" },
  { label: "Até R$ 300.000", value: "300000" },
];

const BODY_TYPES: SelectOption[] = [
  { label: "Todas carrocerias", value: "" },
  { label: "SUV", value: "SUV" },
  { label: "Sedã", value: "Sedan" },
  { label: "Hatch", value: "Hatch" },
  { label: "Picape", value: "Picape" },
  { label: "Utilitário", value: "Utilitario" },
  { label: "Esportivo", value: "Esportivo" },
];

const FUEL_TYPES: SelectOption[] = [
  { label: "Todos combustíveis", value: "" },
  { label: "Flex", value: "Flex" },
  { label: "Gasolina", value: "Gasolina" },
  { label: "Diesel", value: "Diesel" },
  { label: "Híbrido", value: "Hibrido" },
  { label: "Elétrico", value: "Eletrico" },
];

const TRANSMISSION_TYPES: SelectOption[] = [
  { label: "Todos câmbios", value: "" },
  { label: "Automático", value: "Automatico" },
  { label: "Manual", value: "Manual" },
  { label: "CVT", value: "CVT" },
  { label: "Automatizado", value: "Automatizado" },
];

const COLOR_OPTIONS: SelectOption[] = [
  { label: "Todas cores", value: "" },
  { label: "Branco", value: "Branco" },
  { label: "Preto", value: "Preto" },
  { label: "Prata", value: "Prata" },
  { label: "Cinza", value: "Cinza" },
  { label: "Vermelho", value: "Vermelho" },
  { label: "Azul", value: "Azul" },
];

function FieldGroup({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const selectClasses =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

const inputClasses =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

export function FilterSidebar({
  filters,
  city,
  brandOptions,
  modelOptions,
  popularBrands,
  totalResults,
  onPatch,
  onClear,
  className = "",
}: FilterSidebarProps) {
  const [expanded, setExpanded] = useState(false);

  const handleYearMin = useCallback(
    (value: string) => {
      const parsed = value.trim() ? Number(value) : undefined;
      onPatch({ year_min: Number.isFinite(parsed) ? parsed : undefined, page: 1 });
    },
    [onPatch]
  );

  const handleYearMax = useCallback(
    (value: string) => {
      const parsed = value.trim() ? Number(value) : undefined;
      onPatch({ year_max: Number.isFinite(parsed) ? parsed : undefined, page: 1 });
    },
    [onPatch]
  );

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_-14px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-extrabold text-slate-900">Filtros</h2>
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-semibold text-blue-700 transition hover:text-blue-800"
          >
            Limpar filtros
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <FieldGroup label="Marca" htmlFor="fs-brand">
            <select
              id="fs-brand"
              value={filters.brand || ""}
              onChange={(event) =>
                onPatch({ brand: event.target.value || undefined, model: undefined, page: 1 })
              }
              className={selectClasses}
            >
              {brandOptions.map((opt) => (
                <option key={`fs-brand-${opt.value}`} value={opt.value}>
                  {opt.label || "Todas"}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Modelo" htmlFor="fs-model">
            <select
              id="fs-model"
              value={filters.model || ""}
              onChange={(event) => onPatch({ model: event.target.value || undefined, page: 1 })}
              className={selectClasses}
            >
              {modelOptions.map((opt) => (
                <option key={`fs-model-${opt.value}`} value={opt.value}>
                  {opt.label || "Todos"}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Preço" htmlFor="fs-price">
            <select
              id="fs-price"
              value={String(filters.max_price || "")}
              onChange={(event) =>
                onPatch({
                  max_price: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                })
              }
              className={selectClasses}
            >
              {PRICE_RANGES.map((opt) => (
                <option key={`fs-price-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Ano">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1980}
                max={2030}
                placeholder="De"
                aria-label="Ano mínimo"
                value={filters.year_min ?? ""}
                onChange={(event) => handleYearMin(event.target.value)}
                className={inputClasses}
              />
              <input
                type="number"
                inputMode="numeric"
                min={1980}
                max={2030}
                placeholder="Até"
                aria-label="Ano máximo"
                value={filters.year_max ?? ""}
                onChange={(event) => handleYearMax(event.target.value)}
                className={inputClasses}
              />
            </div>
          </FieldGroup>

          <FieldGroup label="Quilometragem" htmlFor="fs-km">
            <select
              id="fs-km"
              value={String(filters.mileage_max || "")}
              onChange={(event) =>
                onPatch({
                  mileage_max: event.target.value ? Number(event.target.value) : undefined,
                  page: 1,
                })
              }
              className={selectClasses}
            >
              <option value="">Qualquer km</option>
              <option value="20000">Até 20.000 km</option>
              <option value="40000">Até 40.000 km</option>
              <option value="60000">Até 60.000 km</option>
              <option value="100000">Até 100.000 km</option>
              <option value="150000">Até 150.000 km</option>
            </select>
          </FieldGroup>

          <FieldGroup label="Carroceria" htmlFor="fs-body">
            <select
              id="fs-body"
              value={filters.body_type || ""}
              onChange={(event) => onPatch({ body_type: event.target.value || undefined, page: 1 })}
              className={selectClasses}
            >
              {BODY_TYPES.map((opt) => (
                <option key={`fs-body-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Combustível" htmlFor="fs-fuel">
            <select
              id="fs-fuel"
              value={filters.fuel_type || ""}
              onChange={(event) => onPatch({ fuel_type: event.target.value || undefined, page: 1 })}
              className={selectClasses}
            >
              {FUEL_TYPES.map((opt) => (
                <option key={`fs-fuel-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Câmbio" htmlFor="fs-trans">
            <select
              id="fs-trans"
              value={filters.transmission || ""}
              onChange={(event) =>
                onPatch({ transmission: event.target.value || undefined, page: 1 })
              }
              className={selectClasses}
            >
              {TRANSMISSION_TYPES.map((opt) => (
                <option key={`fs-trans-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Cor" htmlFor="fs-color">
            <select
              id="fs-color"
              value=""
              onChange={() => undefined}
              disabled
              className={`${selectClasses} opacity-70`}
              title="Filtro de cor em breve"
            >
              {COLOR_OPTIONS.map((opt) => (
                <option key={`fs-color-${opt.value}`} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          {expanded ? (
            <FieldGroup label="Marcas populares">
              <div className="flex flex-wrap gap-1.5">
                {popularBrands.slice(0, 8).map((item) => (
                  <button
                    key={`pop-${item.brand}`}
                    type="button"
                    onClick={() => onPatch({ brand: item.brand, model: undefined, page: 1 })}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-white hover:text-blue-700"
                  >
                    {item.brand}
                    {item.total > 0 ? (
                      <span className="text-[11px] font-bold text-slate-400">
                        {formatTotal(item.total)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </FieldGroup>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-[13px] font-semibold text-blue-700 transition hover:text-blue-800"
          >
            {expanded ? "Ocultar filtros avançados" : "Mostrar mais filtros"}
          </button>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={() => undefined}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
          >
            Ver {formatTotal(totalResults)} ofertas
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500">{city.label}</p>
        </div>
      </div>

      <aside
        className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-5 shadow-[0_8px_30px_-16px_rgba(14,98,216,0.35)]"
        aria-label="Quer vender seu carro?"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-[0_8px_20px_-8px_rgba(14,98,216,0.8)]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M3 13h13l-2-4H5l-2 4Z" />
              <circle cx="7.5" cy="16.5" r="1.5" />
              <circle cx="16.5" cy="16.5" r="1.5" />
              <path d="M16 13V8h3l2 3v2" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-extrabold text-slate-900">Quer vender seu carro?</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
              Anuncie grátis e alcance compradores da sua cidade com contexto regional.
            </p>
          </div>
        </div>
        <Link
          href="/anunciar/novo"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 px-4 text-[13px] font-bold text-white transition hover:bg-blue-800"
        >
          Anuncie agora
        </Link>
      </aside>
    </div>
  );
}
