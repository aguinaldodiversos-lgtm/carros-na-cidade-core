"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { readCityFromLocalStorage } from "@/lib/city/city-storage";
import { slugToRegionHref } from "@/lib/regions/ancora-url";

/**
 * CTA de localização/distribuição da Página Estadual.
 *
 * Briefing 2026-05-21 (Estado → Regional → Cidade):
 *
 *   Quando o visitante usa localização (ou já tem cidade conhecida no
 *   storage), o destino primário é SEMPRE a Página Regional
 *   correspondente — NÃO a Página Cidade. Esta política mantém a
 *   Regional como centro do funil ("Estado recebe, Região converte").
 *
 * Comportamentos:
 *
 *   1. Cidade já conhecida (localStorage, mesma UF):
 *      Renderiza um CTA direto "Ver ofertas na região de [cidade]"
 *      que navega para `/carros-usados/regiao/[slug]`. Sem precisar
 *      pedir geolocation de novo.
 *
 *   2. Cidade desconhecida + browser com geo disponível:
 *      Botão "Ver carros perto de mim" pede `navigator.geolocation`.
 *      Esta versão MVP NÃO resolve coordenadas→cidade no client;
 *      após o consentimento, rola para os blocos abaixo (StateRegionsBlock
 *      + StateTerritorialShortcuts) onde o visitante escolhe a região
 *      manualmente. Resolução coord→cidade fica para iteração futura
 *      (precisa endpoint `/api/public/cities/nearest`).
 *
 *   3. Cidade desconhecida + sem geo: botão "Escolher cidade ou região"
 *      apenas rola para os blocos de descoberta.
 *
 * Importante: NÃO fazer redirecionamento agressivo sem contexto.
 * Toda navegação automática só dispara quando o storage já carrega
 * uma cidade do MESMO estado que o visitante está olhando — sem isso,
 * a Estadual continua a porta de entrada ampla que o briefing pede.
 */

const ANCHOR_ID = "state-regions-anchor";

type Status = "idle" | "requesting" | "granted" | "denied";

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
  const [status, setStatus] = useState<Status>("idle");
  const [knownCity, setKnownCity] = useState<KnownCity | null>(null);

  // Hydrata a partir do localStorage. Só aceita cidade do MESMO estado
  // da página atual — cidade de outro estado não cabe como "região
  // próxima" aqui.
  useEffect(() => {
    const stored = readCityFromLocalStorage();
    if (!stored) return;
    const ufUpper = String(stateUf || "").toUpperCase();
    if (stored.state.toUpperCase() !== ufUpper) return;
    setKnownCity({ slug: stored.slug, name: stored.name });
  }, [stateUf]);

  const scrollToRegions = useCallback(() => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(ANCHOR_ID);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleGeoRequest = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("denied");
      scrollToRegions();
      return;
    }

    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      () => {
        setStatus("granted");
        scrollToRegions();
      },
      () => {
        setStatus("denied");
        scrollToRegions();
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 600_000 }
    );
  }, [scrollToRegions]);

  const handleChooseCity = useCallback(() => {
    setStatus("denied");
    scrollToRegions();
  }, [scrollToRegions]);

  // Quando já temos cidade conhecida, renderiza o atalho regional
  // direto — caminho mais curto Estado → Regional sem fricção.
  if (knownCity) {
    return (
      <section
        aria-label="Sua região"
        className="mx-auto w-full max-w-7xl px-3 pb-3 pt-1 sm:px-6 sm:pb-4 lg:px-8"
        data-testid="state-location-prompt"
      >
        <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary-soft/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cnc-text-strong">
              Sua região está pronta
            </p>
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

  return (
    <section
      aria-label="Encontrar ofertas perto de você"
      className="mx-auto w-full max-w-7xl px-3 pb-3 pt-1 sm:px-6 sm:pb-4 lg:px-8"
      data-testid="state-location-prompt"
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-primary/20 bg-primary-soft/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
        <div className="min-w-0">
          {status === "granted" ? (
            <p
              className="text-sm font-semibold text-cnc-text-strong"
              role="status"
              aria-live="polite"
            >
              Localização detectada — escolha uma região abaixo para ver as
              ofertas próximas.
            </p>
          ) : status === "denied" ? (
            <p
              className="text-sm font-semibold text-cnc-text-strong"
              role="status"
              aria-live="polite"
            >
              Escolha uma cidade nos blocos abaixo para ver as ofertas da região.
            </p>
          ) : (
            <p className="text-sm font-semibold text-cnc-text-strong">
              Encontre ofertas na sua região
            </p>
          )}
          {status === "idle" ? (
            <p className="mt-0.5 text-xs text-cnc-muted">
              Permita a localização ou escolha uma cidade para abrir a Página
              Regional.
            </p>
          ) : null}
        </div>

        {status === "idle" || status === "requesting" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGeoRequest}
              disabled={status === "requesting"}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong disabled:opacity-60"
              data-testid="state-location-geo-cta"
              aria-label="Ver ofertas perto de mim"
            >
              <PinIcon />
              {status === "requesting" ? "Localizando..." : "Ver ofertas perto de mim"}
            </button>
            <button
              type="button"
              onClick={handleChooseCity}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary-soft"
              data-testid="state-location-manual-cta"
              aria-label="Escolher cidade para ver ofertas na região"
            >
              Escolher cidade para ver ofertas na região
            </button>
          </div>
        ) : null}
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
