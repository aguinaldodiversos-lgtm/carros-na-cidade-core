// frontend/components/home/sections/HomeSearchCard.tsx
"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Barra de busca da Home — contrato visual `atualização-home.png`
 * (revisão 2026-05-19).
 *
 * Estrutura mobile-first:
 *   • Container do input: rounded-2xl, borda gray-200, padding compacto em
 *     mobile (px-4 py-3) que cresce em sm+ (px-5 py-4).
 *   • Botão de filtros: círculo azul à direita, 44px mobile / 52px sm+.
 *   • Sem chips de filtro rápido — eliminados nesta revisão para reduzir
 *     peso do topo. Os mesmos filtros existem em /comprar e nos atalhos.
 */

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-gray-500 sm:h-[22px] sm:w-[22px]"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="18" y2="18" />
      <circle cx="16" cy="6" r="2" fill="white" stroke="white" />
      <circle cx="10" cy="12" r="2" fill="white" stroke="white" />
      <circle cx="14" cy="18" r="2" fill="white" stroke="white" />
    </svg>
  );
}

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

  return (
    <section
      aria-label="Buscar veículos"
      className="mx-auto w-full max-w-8xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8"
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
        className="flex items-center gap-2 sm:gap-3"
      >
        <label htmlFor="home-search-input" className="sr-only">
          Buscar veículos
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 sm:gap-3 sm:px-5 sm:py-4">
          <span aria-hidden="true" className="flex shrink-0 items-center">
            <SearchIcon />
          </span>
          <input
            id="home-search-input"
            type="search"
            name="q"
            placeholder="Busque por marca, modelo ou cidade"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            inputMode="search"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-gray-700 outline-none placeholder:text-gray-400 sm:text-base"
          />
        </div>
        <button
          type="submit"
          aria-label="Aplicar filtros e ver ofertas"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 shadow-md transition hover:bg-blue-700 active:scale-95 sm:h-[52px] sm:w-[52px]"
        >
          <SlidersIcon />
        </button>
      </form>
    </section>
  );
}
