"use client";

import { Suspense, type ReactNode } from "react";

import { CityPickerModal } from "@/components/city/CityPickerModal";
import { CityProvider } from "@/lib/city/CityContext";
import type { CityRef } from "@/lib/city/city-types";
import { FavoritesProvider } from "@/lib/favorites/FavoritesContext";

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
        <FavoritesProvider>
          {children}
          <CityPickerModal />
        </FavoritesProvider>
      </CityProvider>
    </Suspense>
  );
}
