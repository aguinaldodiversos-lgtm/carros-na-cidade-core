"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { trackPageView } from "@/lib/analytics/track";

/**
 * Tracker global de page-view (Fase 4.4). Montado uma vez no layout público.
 *
 * Registra UMA visualização por path por navegação (dedup por pathname). Rotas
 * privadas (/admin, /painel) e páginas com tracker dedicado (/veiculo, /blog)
 * são ignoradas pelo inferPageEvent → sem duplicidade.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastTracked.current) return;
    lastTracked.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}

export default AnalyticsTracker;
