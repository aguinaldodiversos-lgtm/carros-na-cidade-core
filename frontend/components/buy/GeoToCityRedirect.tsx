"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  hasUserConfirmedCity,
  readCityFromCookie,
  readCityFromLocalStorage,
} from "@/lib/city/city-storage";
import type { AdsSearchFilters } from "@/lib/search/ads-search";
import { buildCityPath } from "@/lib/buy/territory-variant";

type GeoToCityRedirectProps = {
  /** UF atualmente exibida na página estadual. */
  stateUf: string;
  /** Filtros não-territoriais para preservar na redireção. */
  filters: AdsSearchFilters;
};

const SESSION_FLAG = "cnc.comprar.estadual.geo-redirected";

/**
 * Regra: quando o visitante entra no Comprar Estadual mas já temos cidade
 * confirmada (cookie/localStorage do mesmo UF), redirecionamos suavemente
 * para o Comprar na Cidade. Se não houver cidade conhecida, mantemos na
 * página estadual — o seletor de cidade no header cumpre o fluxo manual.
 *
 * Anti-loop:
 *  - só dispara na variante estadual (este componente só é montado nela);
 *  - só redireciona se a UF da cidade guardada bate com a UF da página atual
 *    (senão sinaliza ao utilizador que a cidade dele é de outro estado e
 *    exige confirmação manual — evita jogá-lo para longe do estado visado);
 *  - sessionStorage impede retries no mesmo boot de página.
 */
export function GeoToCityRedirect({ stateUf, filters }: GeoToCityRedirectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const didAttempt = useRef(false);

  useEffect(() => {
    if (didAttempt.current) return;
    didAttempt.current = true;

    if (typeof window === "undefined") return;

    try {
      if (window.sessionStorage.getItem(SESSION_FLAG) === "1") return;
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // privacy mode — segue sem memória de sessão
    }

    const confirmed = hasUserConfirmedCity();
    const stored = readCityFromLocalStorage() || readCityFromCookie();

    if (!confirmed || !stored?.slug) return;

    const storedUf = (stored.state || "").toUpperCase();
    const pageUf = stateUf.toUpperCase();

    if (!storedUf || storedUf !== pageUf) return;

    const target = buildCityPath(stored.slug, filters);
    if (!target || target === pathname) return;

    router.replace(target);
  }, [router, pathname, stateUf, filters]);

  return null;
}
