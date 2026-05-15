"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { writeCityCookie, writeCityToLocalStorage } from "@/lib/city/city-storage";
import { writeTerritorialPrefs } from "@/lib/territory/territorial-prefs";

/**
 * LocationRegionalPrompt — UX de descoberta territorial.
 *
 * Política UX:
 *   - NUNCA pede geolocalização automaticamente. Só ao clicar.
 *   - Mostra ANTES do clique uma microcopy explicando o uso da localização
 *     (LGPD: consentimento informado).
 *   - Ao clicar em "Usar minha localização", chama navigator.geolocation
 *     com timeout 10s, `enableHighAccuracy: false`, `maximumAge: 60000`.
 *   - Em sucesso, POSTa para /api/location/resolve (BFF que injeta token
 *     interno e não loga coordenadas).
 *   - Resultado mostra:
 *       "✓ Encontramos sua região: Região de Atibaia"
 *       [Ver ofertas da região] [Ver somente Atibaia] [Continuar em SP]
 *   - Cada CTA salva as prefs com source="geolocation" e navega.
 *   - Em recusa de permissão (PermissionDeniedError), mostra alternativa
 *     "Escolher cidade manualmente" (link para abrir o picker existente).
 *   - O componente NUNCA mostra ou loga a coordenada — só o resultado
 *     (nome da cidade/região + distância arredondada).
 *
 * Privacidade/LGPD:
 *   - Sem coordenada em props, state visível ao usuário, ou storage.
 *   - Cookie de prefs (cnc_territorial_prefs_v1) guarda apenas slugs +
 *     source + timestamp.
 *
 * Bots/SEO:
 *   - Server-side render produz a CTA estática (call-to-click). Bots não
 *     têm geolocation API, então nunca disparam o fluxo. URL canônica
 *     da Home não muda.
 */

interface ResolvedLocation {
  city: { slug: string; name: string; state: string } | null;
  state: { code: string; slug: string };
  region: { slug: string; name: string; href: string } | null;
  confidence: "high" | "medium" | "low";
  distanceKm: number;
}

interface LocationRegionalPromptProps {
  /** Vem do server: a flag REGIONAL_PAGE_ENABLED. */
  regionalEnabled: boolean;
  /** Nome do estado em foco (ex: "São Paulo"). Usado no CTA "continuar em X". */
  stateName: string;
  /** UF do estado em foco (ex: "SP"). Usada para salvar prefs como fallback. */
  stateCode: string;
  /**
   * Callback para abrir o picker manual. Opcional — quando não passado, o
   * link aponta para `/comprar/estado/{uf}` como fallback (página estadual
   * sem cidade).
   */
  onOpenManualPicker?: () => void;
}

type PromptState =
  | { kind: "idle" }
  | { kind: "asking" } // navigator.geolocation rodando
  | { kind: "resolving" } // chamada ao BFF
  | { kind: "resolved"; data: ResolvedLocation }
  | { kind: "out_of_coverage" }
  | { kind: "denied" }
  | { kind: "unavailable"; reason: string };

const GEO_TIMEOUT_MS = 10_000;

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
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

async function postResolveLocation(
  latitude: number,
  longitude: number
): Promise<ResolvedLocation | null> {
  const response = await fetch("/api/location/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) return null;
  const envelope = (await response.json()) as {
    ok?: boolean;
    data?: ResolvedLocation | null;
  };
  if (!envelope?.ok) return null;
  return envelope.data ?? null;
}

function persistPrefsForCity(
  city: { slug: string; name: string; state: string },
  region: { slug: string } | null,
  source: "geolocation" | "manual"
) {
  // 1. CityRef compatível com CityContext / cnc_city
  writeCityCookie({
    slug: city.slug,
    name: city.name,
    state: city.state,
    label: `${city.name} (${city.state})`,
  });
  writeCityToLocalStorage(
    {
      slug: city.slug,
      name: city.name,
      state: city.state,
      label: `${city.name} (${city.state})`,
    },
    { userConfirmed: true }
  );
  // 2. Prefs territoriais — região preferida + source + timestamp.
  writeTerritorialPrefs({
    citySlug: city.slug,
    regionSlug: region?.slug ?? null,
    state: city.state,
    source,
  });
}

function persistPrefsForState(stateCode: string) {
  writeTerritorialPrefs({
    citySlug: null,
    regionSlug: null,
    state: stateCode,
    source: "geolocation",
  });
}

export function LocationRegionalPrompt({
  regionalEnabled,
  stateName,
  stateCode,
  onOpenManualPicker,
}: LocationRegionalPromptProps) {
  const [state, setState] = useState<PromptState>({ kind: "idle" });

  const handleUseLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ kind: "unavailable", reason: "no-geolocation" });
      return;
    }

    setState({ kind: "asking" });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // IMPORTANTE: lat/lng só passam pela memória deste callback. Nunca
        // são gravados em storage local nem incluídos em logs do console.
        setState({ kind: "resolving" });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          const resolved = await postResolveLocation(lat, lng);
          if (!resolved || !resolved.city) {
            setState({ kind: "out_of_coverage" });
            return;
          }
          setState({ kind: "resolved", data: resolved });
        } catch {
          setState({ kind: "unavailable", reason: "network" });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ kind: "denied" });
        } else {
          setState({ kind: "unavailable", reason: "geo-error" });
        }
      },
      {
        timeout: GEO_TIMEOUT_MS,
        maximumAge: 60_000,
        enableHighAccuracy: false,
      }
    );
  }, []);

  if (state.kind === "resolved") {
    const { city, region } = state.data;
    if (!city) return null;

    const regionHref = regionalEnabled && region ? region.href : null;
    const cityHref = `/carros-em/${encodeURIComponent(city.slug)}`;
    const stateHref = `/comprar/estado/${city.state.toLowerCase()}`;

    return (
      <section
        aria-labelledby="location-prompt-resolved-heading"
        className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 lg:px-8"
        data-testid="location-prompt-resolved"
      >
        <div className="rounded-xl border border-primary/40 bg-primary-soft p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary-strong">
            <CheckIcon />
            <h2 id="location-prompt-resolved-heading">
              {regionalEnabled && region
                ? `Encontramos sua região: ${region.name}`
                : `Encontramos sua cidade: ${city.name}`}
            </h2>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {regionHref ? (
              <Link
                href={regionHref}
                onClick={() => persistPrefsForCity(city, region, "geolocation")}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
                data-testid="location-prompt-region-cta"
              >
                Ver ofertas da região
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            <Link
              href={cityHref}
              onClick={() => persistPrefsForCity(city, null, "geolocation")}
              className="inline-flex items-center rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
              data-testid="location-prompt-city-cta"
            >
              Ver somente {city.name}
            </Link>
            <Link
              href={stateHref}
              onClick={() => persistPrefsForState(stateCode)}
              className="inline-flex items-center rounded-lg border border-transparent bg-white/40 px-3 py-2 text-sm font-medium text-cnc-muted hover:text-cnc-text transition-colors"
              data-testid="location-prompt-state-cta"
            >
              Continuar vendo {stateName}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (state.kind === "denied" || state.kind === "unavailable" || state.kind === "out_of_coverage") {
    const message =
      state.kind === "denied"
        ? "Localização não autorizada. Você pode escolher sua cidade manualmente."
        : state.kind === "out_of_coverage"
          ? "Não encontramos uma cidade próxima na nossa cobertura. Escolha manualmente:"
          : "Não foi possível usar sua localização. Escolha sua cidade manualmente.";

    return (
      <section
        aria-label="Localização indisponível"
        className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 lg:px-8"
        data-testid="location-prompt-fallback"
      >
        <div className="rounded-xl border border-cnc-line bg-white p-4 sm:p-5">
          <p className="text-sm text-cnc-muted">{message}</p>
          <div className="mt-3">
            {onOpenManualPicker ? (
              <button
                type="button"
                onClick={onOpenManualPicker}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
                data-testid="location-prompt-manual-cta"
              >
                Escolher cidade
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <Link
                href={`/comprar/estado/${stateCode.toLowerCase()}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
                data-testid="location-prompt-manual-cta"
              >
                Ver ofertas de {stateName}
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  // idle / asking / resolving
  const isBusy = state.kind === "asking" || state.kind === "resolving";
  const busyLabel = state.kind === "asking" ? "Pedindo permissão..." : "Resolvendo região...";

  return (
    <section
      aria-label="Encontrar carros próximos"
      className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 lg:px-8"
      data-testid="location-prompt-idle"
    >
      <div className="flex flex-col items-start gap-2 rounded-xl border border-cnc-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-cnc-text-strong sm:text-[15px]">
            Quer ver carros próximos de você?
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-cnc-muted sm:text-[13px]">
            Usamos sua localização só para sugerir a região mais relevante — não salvamos a
            coordenada nem enviamos para terceiros.
          </p>
        </div>
        <button
          type="button"
          onClick={handleUseLocation}
          disabled={isBusy}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong disabled:opacity-60"
          data-testid="location-prompt-trigger"
        >
          <PinIcon />
          {isBusy ? busyLabel : "Ver carros perto de mim"}
        </button>
      </div>
    </section>
  );
}
