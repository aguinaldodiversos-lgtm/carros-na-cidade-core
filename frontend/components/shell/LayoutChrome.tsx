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

  if (isHome) {
    return null;
  }

  return (
    <>
      <TrustRibbon />
      <CityRegionBanner />
    </>
  );
}
