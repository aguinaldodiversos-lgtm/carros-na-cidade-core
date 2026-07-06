"use client";

import { useMemo, useState } from "react";
import { getCatalogGroups } from "@/lib/ads/vehicle-options";

/**
 * Seletor de opcionais por categoria (Conforto / Dirigibilidade / Segurança).
 * Controlado: recebe as keys selecionadas e emite o novo array a cada toggle.
 * Usado no cadastro (wizard) e na edição (EditAdForm).
 *
 * A lista é grande (~100 itens) → tem busca para filtrar. Categorias sem
 * resultado na busca somem. Opcionais são SEMPRE opcionais (nenhum exigido).
 */
type VehicleOptionsSelectorProps = {
  selected: string[];
  onChange: (keys: string[]) => void;
  /**
   * Keys a ocultar do seletor manual (ex.: câmbio, controlado por um <select>
   * dedicado — Fase B). Continuam preservadas em `selected` através dos toggles,
   * só não aparecem para o usuário marcar/desmarcar aqui.
   */
  hiddenKeys?: Iterable<string>;
};

export default function VehicleOptionsSelector({
  selected,
  onChange,
  hiddenKeys,
}: VehicleOptionsSelectorProps) {
  const [query, setQuery] = useState("");
  const hiddenSet = useMemo(() => new Set(hiddenKeys ?? []), [hiddenKeys]);
  const groups = useMemo(
    () =>
      getCatalogGroups().map((g) => ({
        ...g,
        items: g.items.filter((item) => !hiddenSet.has(item.key)),
      })),
    [hiddenSet]
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const normalizedQuery = query.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  function matches(label: string) {
    if (!normalizedQuery) return true;
    return label.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").includes(normalizedQuery);
  }

  function toggle(key: string) {
    const next = new Set(selectedSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next));
  }

  const totalSelected = selected.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar opcional (ex.: airbag, câmbio, multimídia)…"
          className="w-full max-w-md rounded-xl border border-cnc-line bg-white px-3.5 py-2.5 text-sm text-cnc-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-soft"
          aria-label="Buscar opcional"
        />
        <span className="text-xs font-semibold text-cnc-muted">
          {totalSelected} selecionado{totalSelected === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {groups.map((group) => {
          const visibleItems = group.items.filter((item) => matches(item.label));
          if (visibleItems.length === 0) return null;

          const selectedInGroup = group.items.filter((item) => selectedSet.has(item.key)).length;

          return (
            <fieldset
              key={group.category}
              className="rounded-2xl border border-cnc-line bg-cnc-surface p-4"
            >
              <legend className="flex items-center gap-2 px-1 text-sm font-extrabold text-cnc-text-strong">
                {group.label}
                {selectedInGroup > 0 ? (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
                    {selectedInGroup}
                  </span>
                ) : null}
              </legend>
              <ul className="mt-3 space-y-1.5">
                {visibleItems.map((item) => {
                  const checked = selectedSet.has(item.key);
                  return (
                    <li key={item.key}>
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1 text-[13px] leading-snug text-cnc-text transition hover:bg-cnc-bg/60">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-cnc-line text-primary focus:ring-primary-soft"
                        />
                        <span className="min-w-0">{item.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
