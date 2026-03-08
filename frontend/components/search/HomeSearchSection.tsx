// frontend/components/search/HomeSearchSection.tsx

"use client";

import { SmartVehicleSearch } from "./SmartVehicleSearch";
import { TerritorialEntrySection } from "../home/TerritorialEntrySection";

export function HomeSearchSection() {
  return (
    <section className="w-full">
      <div className="mx-auto max-w-6xl">
        <SmartVehicleSearch
          placeholder="Ex.: Corolla até 110 mil em Campinas"
          resultsBasePath="/anuncios"
        />

        <TerritorialEntrySection />
      </div>
    </section>
  );
}
