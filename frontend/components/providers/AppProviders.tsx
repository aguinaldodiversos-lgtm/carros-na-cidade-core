"use client";

import { Suspense, type ReactNode } from "react";

import { CityPickerModal } from "@/components/city/CityPickerModal";
import { CityProvider } from "@/lib/city/CityContext";
import type { CityRef } from "@/lib/city/city-types";

export function AppProviders({
  children,
  initialCity,
}: {
  children: ReactNode;
  initialCity: CityRef;
}) {
  return (
    <Suspense fallback={null}>
      <CityProvider initialCity={initialCity}>
        {children}
        <CityPickerModal />
      </CityProvider>
    </Suspense>
  );
}
