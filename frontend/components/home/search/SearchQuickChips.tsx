"use client";

import type { HomeQuickChipDef, HomeQuickChipId } from "./home-search-config";

type SearchQuickChipsProps = {
  chips: HomeQuickChipDef[];
  selected: ReadonlySet<HomeQuickChipId>;
  onToggle: (id: HomeQuickChipId) => void;
};

export function SearchQuickChips({ chips, selected, onToggle }: SearchQuickChipsProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Atalhos rápidos
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5 sm:flex-wrap sm:overflow-visible">
        {chips.map((chip) => {
          const isOn = selected.has(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => onToggle(chip.id)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                isOn
                  ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
              aria-pressed={isOn}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
