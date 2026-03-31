"use client";

import type { VehicleSearchKind } from "@/lib/search/search-intent-types";

type VehicleTypeToggleProps = {
  value: VehicleSearchKind;
  onChange: (v: VehicleSearchKind) => void;
};

export function VehicleTypeToggle({ value, onChange }: VehicleTypeToggleProps) {
  return (
    <div
      className="inline-flex rounded-full border border-slate-200/90 bg-slate-100/80 p-1 shadow-inner"
      role="group"
      aria-label="Tipo de veículo"
    >
      <button
        type="button"
        onClick={() => onChange("car")}
        className={`relative min-h-[44px] rounded-full px-5 py-2 text-sm font-bold transition ${
          value === "car"
            ? "bg-white text-blue-800 shadow-md ring-1 ring-slate-200/80"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        Carros
      </button>
      <button
        type="button"
        onClick={() => onChange("motorcycle")}
        className={`relative min-h-[44px] rounded-full px-5 py-2 text-sm font-bold transition ${
          value === "motorcycle"
            ? "bg-white text-blue-800 shadow-md ring-1 ring-slate-200/80"
            : "text-slate-500 hover:text-slate-800"
        }`}
      >
        Motos
      </button>
    </div>
  );
}
