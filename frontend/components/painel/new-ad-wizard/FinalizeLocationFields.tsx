"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BR_UF_VALUES } from "@/lib/painel/br-states";
import type { WizardFormState } from "./types";

const selectClass =
  "w-full rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition focus:border-[#AFC6FF] focus:bg-white";

const labelClass = "mb-2 block text-sm font-semibold text-[#1D2440]";

type Patch = (partial: Partial<WizardFormState>) => void;

type CityRow = { id: number; name: string; state: string; slug?: string };

export function FinalizeLocationFields({ state, patch }: { state: WizardFormState; patch: Patch }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CityRow[]>([]);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const uf = state.state.trim().toUpperCase().slice(0, 2);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (uf.length !== 2 || q.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: q.trim(), uf });
        const res = await fetch(`/api/painel/cidades/search?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as { data?: CityRow[] };
        const rows = Array.isArray(json?.data) ? json.data : [];
        setSuggestions(rows);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [uf]
  );

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = state.city.trim();
    if (uf.length !== 2 || q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(q);
    }, 320);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [state.city, uf, fetchSuggestions]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function pick(row: CityRow) {
    patch({
      cityId: row.id,
      city: row.name,
      state: String(row.state).trim().toUpperCase().slice(0, 2),
    });
    setSuggestions([]);
    setOpen(false);
  }

  const ufValue = state.state.length === 2 ? state.state.toUpperCase() : "";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className={labelClass}>
          Estado (UF) <span className="text-red-500">*</span>
        </span>
        <select
          className={selectClass}
          value={ufValue}
          onChange={(e) => {
            patch({ state: e.target.value, cityId: null, city: "" });
          }}
        >
          <option value="">Selecione</option>
          {BR_UF_VALUES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>

      <div className="relative block" ref={wrapRef}>
        <div className={labelClass}>
          Cidade <span className="text-red-500">*</span>
          {state.cityId != null ? (
            <span className="ml-2 text-xs font-normal text-green-700">(confirmada na base)</span>
          ) : null}
        </div>
        <input
          className={selectClass}
          value={state.city}
          onChange={(e) => patch({ city: e.target.value, cityId: null })}
          onFocus={() => setOpen(true)}
          placeholder="Digite para buscar e escolha na lista"
          autoComplete="off"
        />
        {loading ? <div className="mt-1 text-xs text-[#6E748A]">Buscando cidades…</div> : null}
        {open && suggestions.length > 0 ? (
          <ul className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-[18px] border border-[#E5E9F2] bg-white py-1 shadow-lg">
            {suggestions.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left text-sm text-[#1D2440] transition hover:bg-[#EEF4FF]"
                  onClick={() => pick(row)}
                >
                  {row.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
