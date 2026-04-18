"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { buildComprarUrlFromHomeSearch } from "@/lib/search/build-home-comprar-url";
import { parseSearchIntent } from "@/lib/search/search-intent-parser";
import type { SearchIntentProviderContext } from "@/lib/search/search-intent-types";
import type { VehicleSearchKind } from "@/lib/search/search-intent-types";

import {
  HOME_QUICK_CHIPS,
  mergeSelectedChipPatches,
  type HomeQuickChipId,
} from "./home-search-config";
import { SearchQuickChips } from "./SearchQuickChips";
import { SmartSearchInput } from "./SmartSearchInput";
import { VehicleTypeToggle } from "./VehicleTypeToggle";

const BODY_EXCLUSIVE: HomeQuickChipId[] = ["suv", "sedan", "hatch"];

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
};

export type HomeSearchShellProps = {
  featuredCities: FeaturedCity[];
  defaultCitySlug: string;
  defaultCityLabel: string;
  /** Total aproximado de anúncios (opcional) — exibido no CTA. */
  totalAdsHint?: number | string | null;
};

function formatOfferCount(value: number | string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toLocaleString("pt-BR");
}

export function HomeSearchShell({
  featuredCities,
  defaultCitySlug,
  defaultCityLabel,
  totalAdsHint,
}: HomeSearchShellProps) {
  const router = useRouter();
  const formId = useId();
  const searchLabelId = `${formId}-label`;

  const [vehicleType, setVehicleType] = useState<VehicleSearchKind>("car");
  const [query, setQuery] = useState("");
  const [selectedChips, setSelectedChips] = useState<Set<HomeQuickChipId>>(() => new Set());

  const parserContext = useMemo<SearchIntentProviderContext>(
    () => ({
      defaultCitySlug,
      defaultCityLabel,
      featuredCities: featuredCities.map((c) => ({ name: c.name, slug: c.slug })),
    }),
    [defaultCitySlug, defaultCityLabel, featuredCities]
  );

  const headline = useMemo(() => {
    const kind = vehicleType === "car" ? "Carros" : "Motos";
    return (
      <>
        Busque por <span aria-hidden>✨</span>{" "}
        <span className="font-extrabold text-slate-900">
          {kind} em {defaultCityLabel}
        </span>
      </>
    );
  }, [vehicleType, defaultCityLabel]);

  const toggleChip = useCallback((id: HomeQuickChipId) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (BODY_EXCLUSIVE.includes(id)) {
        for (const b of BODY_EXCLUSIVE) {
          if (b !== id) next.delete(b);
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const parsed = parseSearchIntent(query, parserContext);
      const chipFilters = mergeSelectedChipPatches(selectedChips, defaultCitySlug);
      const href = buildComprarUrlFromHomeSearch({
        defaultCitySlug,
        vehicleType,
        parsed,
        chipFilters,
      });
      router.push(href);
    },
    [query, parserContext, selectedChips, defaultCitySlug, vehicleType, router]
  );

  const offerHint = formatOfferCount(totalAdsHint);
  const ctaLabel = offerHint != null ? `Ver ofertas (${offerHint})` : "Ver ofertas";

  return (
    <section
      id="home-smart-search"
      className="relative isolate z-30 -mt-8 rounded-[24px] border border-slate-200/90 bg-white px-4 py-6 shadow-[0_24px_56px_-16px_rgba(15,23,42,0.14)] sm:-mt-10 sm:px-7 sm:py-8 md:-mt-[52px]"
      aria-labelledby={searchLabelId}
    >
      <div className="flex flex-col gap-5 lg:gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <p
            id={searchLabelId}
            className="max-w-xl text-[15px] font-semibold leading-snug text-slate-700 sm:text-base"
          >
            {headline}
          </p>
          <VehicleTypeToggle value={vehicleType} onChange={setVehicleType} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label htmlFor={`${formId}-q`} className="sr-only">
              Descreva o que você procura
            </label>
            <SmartSearchInput
              id={`${formId}-q`}
              value={query}
              onChange={setQuery}
              placeholder="Descreva o que você procura: ex. Corolla automático até 90 mil em Campinas"
            />
          </div>

          <SearchQuickChips
            chips={HOME_QUICK_CHIPS}
            selected={selectedChips}
            onToggle={toggleChip}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-slate-500">
              Filtros detalhados na página de resultados.
            </p>
            <button
              type="submit"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[#0e62d8] px-8 text-base font-extrabold text-white shadow-[0_14px_32px_rgba(14,98,216,0.28)] transition hover:bg-[#0c4fb0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e62d8] sm:w-auto sm:min-w-[220px]"
            >
              {ctaLabel}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
