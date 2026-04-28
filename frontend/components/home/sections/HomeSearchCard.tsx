// frontend/components/home/sections/HomeSearchCard.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SearchBar } from "@/components/ui/SearchBar";

/**
 * Card de busca da Home — alinhado ao mockup `pagina Home.png`.
 *
 * Renderiza, no topo da Home (logo abaixo do header global):
 *   1. SearchBar canônica (DS) com botão de filtros à direita.
 *   2. Linha de chips de filtro rápido com ícones (Até R$ 50 mil, SUV,
 *      Abaixo da FIPE, Lojas).
 *
 * Esta seção foi extraída do antigo `HomeHero` para que o banner regional
 * (`HomeHero`, com CTA interno "Ver ofertas →") possa aparecer ABAIXO dos
 * atalhos circulares, espelhando a ordem do mockup.
 */

type QuickFilter = {
  key: string;
  label: string;
  query: string;
  icon: React.ReactNode;
};

const PriceTagIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12V4h8l10 10-8 8L3 12Z" />
    <circle cx="8" cy="8" r="1.6" />
  </svg>
);

const SuvIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 14V12l2-5a2 2 0 0 1 1.9-1.4h10.2A2 2 0 0 1 19 7l2 5v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M6 11h12" />
    <circle cx="7.5" cy="14" r="1" />
    <circle cx="16.5" cy="14" r="1" />
  </svg>
);

const DollarIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v18" />
    <path d="M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7" />
  </svg>
);

const StoreIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 9h16l-1.2-3.6a1.5 1.5 0 0 0-1.4-1H6.6a1.5 1.5 0 0 0-1.4 1L4 9Z" />
    <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
    <path d="M9 14h6" />
  </svg>
);

const SlidersIcon = (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6h13" />
    <path d="M4 12h7" />
    <path d="M4 18h11" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="14" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

const QUICK_FILTERS: ReadonlyArray<QuickFilter> = [
  { key: "ate-50", label: "Até R$ 50 mil", query: "price_max=50000", icon: PriceTagIcon },
  { key: "suv", label: "SUV", query: "body_type=SUV", icon: SuvIcon },
  { key: "below-fipe", label: "Abaixo da FIPE", query: "below_fipe=true", icon: DollarIcon },
  { key: "lojas", label: "Lojas", query: "seller_type=dealer", icon: StoreIcon },
];

interface HomeSearchCardProps {
  defaultCitySlug: string;
}

export function HomeSearchCard({ defaultCitySlug }: HomeSearchCardProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const submit = useCallback(
    (value: string) => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      if (defaultCitySlug) params.set("city_slug", defaultCitySlug);
      router.push(`/comprar?${params.toString()}`);
    },
    [defaultCitySlug, router]
  );

  const goWithFilter = useCallback(
    (filterQuery: string) => {
      const params = new URLSearchParams(filterQuery);
      if (defaultCitySlug) params.set("city_slug", defaultCitySlug);
      router.push(`/comprar?${params.toString()}`);
    },
    [defaultCitySlug, router]
  );

  return (
    <section
      aria-label="Buscar veículos"
      className="mx-auto w-full max-w-8xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8"
    >
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={submit}
        placeholder="Busque por marca, modelo ou cidade"
        ariaLabel="Buscar veículos"
        filterButton={
          <Button
            type="submit"
            variant="primary"
            size="md"
            aria-label="Aplicar filtros e ver ofertas"
            className="!rounded-full !px-4"
          >
            {SlidersIcon}
          </Button>
        }
      />

      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
        <span className="sr-only">Filtros rápidos</span>
        {QUICK_FILTERS.map((f) => (
          <Chip
            key={f.key}
            variant="filter"
            iconLeft={f.icon}
            onClick={() => goWithFilter(f.query)}
            className="shrink-0"
          >
            {f.label}
          </Chip>
        ))}
      </div>
    </section>
  );
}
