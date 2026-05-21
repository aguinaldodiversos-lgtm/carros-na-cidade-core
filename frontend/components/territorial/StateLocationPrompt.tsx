"use client";

import { useCallback, useState } from "react";

/**
 * CTA de localização/distribuição da Página Estadual.
 *
 * Briefing 2026-05-20 (item 7): a Estadual deve oferecer entrada
 * para localização/região com dois caminhos:
 *
 *   - "Ver ofertas perto de mim" → solicita `navigator.geolocation` no
 *     browser. Quando permitido, sinaliza ao usuário que a localização
 *     foi capturada e direciona visualmente para os blocos "Regiões em
 *     destaque" / "Cidades com mais ofertas" abaixo (via scroll para
 *     `#state-regions-anchor`).
 *
 *   - "Escolher cidade ou região" → fallback manual que também rola
 *     para a mesma âncora; mantém a Estadual navegável quando o usuário
 *     nega ou ignora a permissão.
 *
 * Importante (briefing): NÃO fazer redirecionamento agressivo sem
 * contexto. Esta versão MVP NÃO resolve coordenadas → cidade
 * automaticamente — apenas valida consentimento de geolocalização e
 * conduz o usuário para os blocos de descoberta abaixo. Resolução
 * coord→cidade fica para iteração futura (precisa endpoint
 * `/api/public/cities/nearest` no backend).
 */

const ANCHOR_ID = "state-regions-anchor";

type Status = "idle" | "requesting" | "granted" | "denied";

export function StateLocationPrompt() {
  const [status, setStatus] = useState<Status>("idle");

  const scrollToRegions = useCallback(() => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(ANCHOR_ID);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleGeoRequest = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Browser sem suporte — fallback equivalente ao "Escolher cidade".
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
              Localização detectada — confira regiões e cidades próximas
              abaixo.
            </p>
          ) : status === "denied" ? (
            <p
              className="text-sm font-semibold text-cnc-text-strong"
              role="status"
              aria-live="polite"
            >
              Escolha sua cidade ou região nos blocos abaixo.
            </p>
          ) : (
            <p className="text-sm font-semibold text-cnc-text-strong">
              Encontre ofertas perto de você
            </p>
          )}
          {status === "idle" ? (
            <p className="mt-0.5 text-xs text-cnc-muted">
              Permita a localização ou escolha manualmente.
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
              aria-label="Escolher cidade ou região"
            >
              Escolher cidade ou região
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
