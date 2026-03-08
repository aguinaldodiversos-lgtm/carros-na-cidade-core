"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdsFacetsResponse, AdsSearchFilters } from "../../lib/search/ads-search";

interface SearchFacetsSidebarProps {
  facets: AdsFacetsResponse["facets"] | null;
  filters: AdsSearchFilters;
  onChange: (patch: Partial<AdsSearchFilters>) => void;
  lockedKeys?: Array<keyof AdsSearchFilters>;
}

function parseCurrencyInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function SearchFacetsSidebar({
  facets,
  filters,
  onChange,
  lockedKeys = [],
}: SearchFacetsSidebarProps) {
  const locked = useMemo(() => new Set<keyof AdsSearchFilters>(lockedKeys), [lockedKeys]);

  const [minPrice, setMinPrice] = useState(filters.min_price?.toString() || "");
  const [maxPrice, setMaxPrice] = useState(filters.max_price?.toString() || "");
  const [yearMin, setYearMin] = useState(filters.year_min?.toString() || "");
  const [yearMax, setYearMax] = useState(filters.year_max?.toString() || "");

  useEffect(() => {
    setMinPrice(filters.min_price?.toString() || "");
    setMaxPrice(filters.max_price?.toString() || "");
    setYearMin(filters.year_min?.toString() || "");
    setYearMax(filters.year_max?.toString() || "");
  }, [filters.min_price, filters.max_price, filters.year_min, filters.year_max]);

  const topBrands = useMemo(() => facets?.brands?.slice(0, 12) || [], [facets]);

  const topModels = useMemo(() => {
    if (!facets?.models) return [];
    if (!filters.brand) return facets.models.slice(0, 12);

    return facets.models
      .filter(
        (item) =>
          String(item.brand).toLowerCase() === String(filters.brand).toLowerCase()
      )
      .slice(0, 12);
  }, [facets, filters.brand]);

  return (
    <aside className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Preço</h3>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Mínimo"
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Máximo"
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              min_price: parseCurrencyInput(minPrice),
              max_price: parseCurrencyInput(maxPrice),
              page: 1,
            })
          }
          className="mt-3 w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Aplicar preço
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Ano</h3>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            placeholder="De"
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            placeholder="Até"
            className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            onChange({
              year_min: yearMin ? Number(yearMin) : undefined,
              year_max: yearMax ? Number(yearMax) : undefined,
              page: 1,
            })
          }
          className="mt-3 w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Aplicar ano
        </button>
      </div>

      {!locked.has("brand") && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Marcas</h3>

          <div className="mt-3 flex flex-wrap gap-2">
            {topBrands.map((item) => (
              <button
                key={item.brand}
                type="button"
                onClick={() =>
                  onChange({
                    brand:
                      filters.brand === item.brand ? undefined : item.brand,
                    model: undefined,
                    page: 1,
                  })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filters.brand === item.brand
                    ? "bg-blue-600 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {item.brand} ({item.total})
              </button>
            ))}
          </div>
        </div>
      )}

      {!locked.has("model") && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Modelos</h3>

          <div className="mt-3 flex flex-wrap gap-2">
            {topModels.map((item) => (
              <button
                key={`${item.brand}-${item.model}`}
                type="button"
                onClick={() =>
                  onChange({
                    brand: item.brand,
                    model:
                      filters.model === item.model ? undefined : item.model,
                    page: 1,
                  })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filters.model === item.model
                    ? "bg-blue-600 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {item.model} ({item.total})
              </button>
            ))}
          </div>
        </div>
      )}

      {!locked.has("fuel_type") && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Combustível</h3>

          <div className="mt-3 flex flex-wrap gap-2">
            {(facets?.fuelTypes || []).slice(0, 8).map((item) => (
              <button
                key={item.fuel_type}
                type="button"
                onClick={() =>
                  onChange({
                    fuel_type:
                      filters.fuel_type === item.fuel_type
                        ? undefined
                        : item.fuel_type,
                    page: 1,
                  })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filters.fuel_type === item.fuel_type
                    ? "bg-blue-600 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {item.fuel_type} ({item.total})
              </button>
            ))}
          </div>
        </div>
      )}

      {!locked.has("body_type") && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Carroceria</h3>

          <div className="mt-3 flex flex-wrap gap-2">
            {(facets?.bodyTypes || []).slice(0, 8).map((item) => (
              <button
                key={item.body_type}
                type="button"
                onClick={() =>
                  onChange({
                    body_type:
                      filters.body_type === item.body_type
                        ? undefined
                        : item.body_type,
                    page: 1,
                  })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filters.body_type === item.body_type
                    ? "bg-blue-600 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {item.body_type} ({item.total})
              </button>
            ))}
          </div>
        </div>
      )}

      {!locked.has("below_fipe") && (
        <div>
          <button
            type="button"
            onClick={() =>
              onChange({
                below_fipe: filters.below_fipe === true ? undefined : true,
                page: 1,
              })
            }
            className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition ${
              filters.below_fipe === true
                ? "bg-emerald-600 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Abaixo da FIPE
          </button>
        </div>
      )}
    </aside>
  );
}
