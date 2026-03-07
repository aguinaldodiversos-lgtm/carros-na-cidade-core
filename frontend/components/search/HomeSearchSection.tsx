// frontend/components/search/HomeSearchSection.tsx

"use client";

import { SmartVehicleSearch } from "./SmartVehicleSearch";

export function HomeSearchSection() {
  return (
    <section className="w-full">
      <div className="mx-auto max-w-5xl">
        <SmartVehicleSearch
          placeholder="Ex.: Corolla até 110 mil em Campinas"
          resultsBasePath="/anuncios"
        />
      </div>
    </section>
  );
}
