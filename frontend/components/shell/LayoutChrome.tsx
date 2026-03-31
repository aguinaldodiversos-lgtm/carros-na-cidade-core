"use client";

import { usePathname } from "next/navigation";

import { CityRegionBanner } from "@/components/city/CityRegionBanner";
import { TrustRibbon } from "@/components/shell/TrustRibbon";

/**
 * Faixas de confiança / região — ocultas na Home para alinhar ao layout tipo “marketplace” (referência visual).
 */
export function LayoutChrome() {
  const pathname = usePathname() || "/";
  const isHome = pathname === "/";
  /** Catálogo comprar: início direto após o header, sem faixas institucionais. */
  const isComprar = pathname === "/comprar" || pathname.startsWith("/comprar/");

  if (isHome || isComprar) {
    return null;
  }

  return (
    <>
      <TrustRibbon />
      <CityRegionBanner />
    </>
  );
}
