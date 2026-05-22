"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import {
  persistResolvedCity,
  postResolveLocation,
  type ResolvedLocation,
} from "@/lib/location/resolve-client";
import { slugToRegionHref } from "@/lib/regions/ancora-url";

/**
 * Hook compartilhado para "Ver carros perto de mim".
 *
 * Briefing 2026-05-21 (Estado → Regional → Cidade): qualquer página
 * pública de catálogo (Home, Estadual, Regional, Cidade, /comprar)
 * deve oferecer um CTA de geolocalização que SEMPRE redirecione para a
 * Página REGIONAL (`/carros-usados/regiao/[slug]`), nunca para Cidade
 * ou Estado diretamente.
 *
 * Responsabilidades centralizadas aqui (evita lógica duplicada nos
 * componentes Home / catálogo):
 *
 *   1. Solicitar `navigator.geolocation.getCurrentPosition` com
 *      `enableHighAccuracy: false` + timeout configurável.
 *   2. Encaminhar coords para o BFF `/api/location/resolve` (proxia o
 *      backend interno com X-Internal-Token injetado server-side).
 *   3. Distinguir falhas (`denied`, `unavailable`, `backend_error`,
 *      `out_of_coverage`) — cada uma com UI diferente.
 *   4. Persistir cidade no cookie/localStorage para futuras visitas.
 *   5. Navegar para a Regional via `router.push` com fallback para
 *      `window.location.assign` (caso o AppRouter falhe).
 *
 * Privacidade (briefing item 7):
 *   - Coordenadas NÃO são persistidas em storage nem logadas.
 *   - O hook nunca expõe lat/lng no state público.
 *   - Cookie `cnc_city` guarda só slug/name/state/label.
 *
 * Destino sempre Regional:
 *   - Quando o backend devolve `region.href`, usamos.
 *   - Quando devolve só a cidade (region: null), construímos a URL
 *     regional pelo slug. A Página Regional é dinâmica por cidade,
 *     então qualquer slug válido funciona.
 *   - Cidade direto (`/carros-em/[slug]`) só quando o caller força
 *     via `fallbackToCityWhenNoRegional=true` E `regionalEnabled=false`.
 *     Default: NUNCA pular a Regional.
 */

type NearbyState =
  | { kind: "idle" }
  | { kind: "locating" } // engloba "asking" + "resolving" — UX vê só "Localizando..."
  | { kind: "denied" }
  | { kind: "unavailable" } // navegador sem geo, ou erro técnico
  | { kind: "backend_error"; status: number } // backend offline / 401 / 5xx
  | { kind: "out_of_coverage" } // cidade fora do raio aceitável
  | { kind: "redirecting"; href: string }; // sucesso, navegação iniciada

type UseNearbyRegionRedirectOptions = {
  /**
   * Quando `false`, o redirect cai em `/carros-em/[slug]` em vez da
   * Regional. Default: `true` — o briefing manda sempre Regional. O
   * caller só deve passar `false` quando souber que a flag regional
   * está OFF (cenário em que a Regional retorna 404 e seria pior).
   */
  regionalEnabled?: boolean;
  /**
   * Timeout do navigator.geolocation. Default 10s.
   */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

export type UseNearbyRegionRedirectResult = {
  state: NearbyState;
  /** Dispara o fluxo de geolocalização. */
  trigger: () => void;
  /** Volta para o estado idle (limpa erro para tentar de novo). */
  reset: () => void;
  /** Resposta resolvida (city/region) — disponível só em redirecting. */
  resolvedLocation: ResolvedLocation | null;
};

export function useNearbyRegionRedirect(
  options: UseNearbyRegionRedirectOptions = {}
): UseNearbyRegionRedirectResult {
  const { regionalEnabled = true, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const router = useRouter();
  const [state, setState] = useState<NearbyState>({ kind: "idle" });
  const [resolvedLocation, setResolvedLocation] =
    useState<ResolvedLocation | null>(null);
  // Guarda contra double-trigger (clique duplo, re-render em strict mode).
  const inFlightRef = useRef(false);

  const navigate = useCallback(
    (target: string) => {
      setState({ kind: "redirecting", href: target });
      // Fallback duplo: router.push primeiro (mantém AppRouter hidratado);
      // window.location.assign garante navegação em ambientes sem
      // AppRouterContext (jsdom sem provider, hidratação falhada).
      if (router && typeof router.push === "function") {
        router.push(target);
      } else if (typeof window !== "undefined") {
        window.location.assign(target);
      }
    },
    [router]
  );

  const trigger = useCallback(() => {
    if (inFlightRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ kind: "unavailable" });
      return;
    }

    inFlightRef.current = true;
    setState({ kind: "locating" });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        // Coords vivem só no escopo desta closure. Não vão para state,
        // storage, nem logs.
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        const outcome = await postResolveLocation(lat, lng);
        inFlightRef.current = false;

        if (outcome.kind === "backend_error") {
          setState({ kind: "backend_error", status: outcome.status });
          return;
        }

        if (outcome.kind === "empty") {
          setState({ kind: "out_of_coverage" });
          return;
        }

        const { city, region } = outcome.data;
        if (!city) {
          setState({ kind: "out_of_coverage" });
          return;
        }

        setResolvedLocation(outcome.data);
        persistResolvedCity(city, region, "geolocation");

        // Destino: sempre Regional quando a flag está ligada.
        // - Backend devolveu region.href? Usa direto.
        // - Não devolveu? Constrói com slugToRegionHref(citySlug).
        // - Flag regional OFF? Última opção é Cidade (não dá pra ir
        //   regional sem flag, retornaria 404 do middleware).
        let target: string;
        if (regionalEnabled) {
          target = region?.href || slugToRegionHref(city.slug);
        } else {
          target = `/carros-em/${encodeURIComponent(city.slug)}`;
        }

        navigate(target);
      },
      (err) => {
        inFlightRef.current = false;
        if (err.code === err.PERMISSION_DENIED) {
          setState({ kind: "denied" });
        } else {
          // POSITION_UNAVAILABLE / TIMEOUT → cai em `unavailable`.
          setState({ kind: "unavailable" });
        }
      },
      {
        timeout: timeoutMs,
        maximumAge: 60_000,
        enableHighAccuracy: false,
      }
    );
  }, [navigate, regionalEnabled, timeoutMs]);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setState({ kind: "idle" });
    setResolvedLocation(null);
  }, []);

  return { state, trigger, reset, resolvedLocation };
}
