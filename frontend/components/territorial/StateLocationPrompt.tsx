"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { readCityFromLocalStorage } from "@/lib/city/city-storage";
import { slugToRegionHref } from "@/lib/regions/ancora-url";

/**
 * CTA de localização/distribuição da Página Estadual.
 *
 * Briefing 2026-05-21 (Estado → Regional → Cidade):
 *
 *   A Estadual é porta de entrada ampla — o visitante precisa de um
 *   caminho rápido para a Região correta. Esse componente cobre
 *   dois cenários:
 *
 *   1. Cidade já conhecida (localStorage do mesmo UF):
 *      Renderiza um atalho direto "Ver ofertas na região de [cidade]"
 *      que navega para /carros-usados/regiao/[slug]. Sem precisar
 *      pedir geolocation de novo.
 *
 *   2. Cidade desconhecida:
 *      Renderiza o NearbyRegionButton (variante default) que faz o
 *      fluxo completo de geolocalização → /api/location/resolve →
 *      navega para a Página Regional da cidade detectada.
 *
 * Privacidade (briefing item 7): coords nunca persistidas. Hook
 * `useNearbyRegionRedirect` documenta as garantias.
 */

type StateLocationPromptProps = {
  /**
   * UF da Página Estadual em foco (ex.: "SP"). Usado para filtrar a
   * cidade do localStorage — só sugerimos "Ver ofertas na região de X"
   * quando X pertence ao mesmo estado da página atual.
   */
  stateUf: string;
};

type KnownCity = {
  slug: string;
  name: string;
};

export function StateLocationPrompt({ stateUf }: StateLocationPromptProps) {
  const [knownCity, setKnownCity] = useState<KnownCity | null>(null);

  useEffect(() => {
    const stored = readCityFromLocalStorage();
    if (!stored) return;
    const ufUpper = String(stateUf || "").toUpperCase();
    if (stored.state.toUpperCase() !== ufUpper) return;
    setKnownCity({ slug: stored.slug, name: stored.name });
  }, [stateUf]);

  if (!knownCity) {
    // Sem cidade conhecida o catálogo já mostra o NearbyRegionButton
    // (injetado pelo BuyMarketplacePageClient acima do grid). Não
    // duplicamos aqui — manteria dois CTAs idênticos competindo.
    return null;
  }

  return (
    <section
      aria-label="Sua região"
      className="mx-auto w-full max-w-7xl px-3 pb-3 pt-1 sm:px-6 sm:pb-4 lg:px-8"
      data-testid="state-location-prompt"
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary-soft/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cnc-text-strong">Sua região está pronta</p>
          <p className="mt-0.5 text-xs text-cnc-muted">
            Ver ofertas em volta de {knownCity.name} sem ter que filtrar de novo.
          </p>
        </div>
        <Link
          href={slugToRegionHref(knownCity.slug)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
          data-testid="state-location-known-city-cta"
          aria-label={`Ver ofertas na região de ${knownCity.name}`}
        >
          <PinIcon />
          Ver ofertas na região de {knownCity.name}
        </Link>
      </div>
    </section>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  );
}
