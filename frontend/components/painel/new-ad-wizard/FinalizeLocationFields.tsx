"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BR_UF_VALUES } from "@/lib/painel/br-states";
import type { WizardFormState } from "./types";

const selectClass =
  "w-full rounded-[18px] border border-[#E5E9F2] bg-[#FBFCFF] px-4 py-3 text-sm text-[#1D2440] outline-none transition focus:border-[#AFC6FF] focus:bg-white";

const labelClass = "mb-2 block text-sm font-semibold text-[#1D2440]";

type Patch = (partial: Partial<WizardFormState>) => void;

type CityRow = { id: number; name: string; state: string; slug?: string };

function normalizeCitySearchRows(raw: unknown): CityRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CityRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const idRaw = o.id;
    const id =
      typeof idRaw === "number" && Number.isFinite(idRaw)
        ? Math.trunc(idRaw)
        : typeof idRaw === "string"
          ? parseInt(String(idRaw).trim(), 10)
          : typeof idRaw === "bigint"
            ? Number(idRaw)
            : NaN;
    if (!Number.isFinite(id) || id <= 0) continue;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    const st = typeof o.state === "string" ? o.state.trim() : "";
    out.push({
      id,
      name,
      state: st,
      slug: typeof o.slug === "string" ? o.slug : undefined,
    });
  }
  return out;
}

export function FinalizeLocationFields({ state, patch }: { state: WizardFormState; patch: Patch }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CityRow[]>([]);
  const debounceRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uf = state.state.trim().toUpperCase().slice(0, 2);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      if (uf.length !== 2 || q.trim().length < 2) {
        setSuggestions([]);
        setSearchError(null);
        return;
      }
      setLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ q: q.trim(), uf });
        const res = await fetch(`/api/painel/cidades/search?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: unknown;
          message?: string;
        };
        if (!res.ok) {
          setSuggestions([]);
          setSearchError(
            typeof json?.message === "string" && json.message.trim()
              ? json.message
              : "Não foi possível buscar cidades. Tente novamente."
          );
          return;
        }
        const rows = normalizeCitySearchRows(json?.data);
        setSuggestions(rows);
      } catch {
        setSuggestions([]);
        setSearchError("Falha de rede ao buscar cidades.");
      } finally {
        setLoading(false);
      }
    },
    [uf]
  );

  useEffect(() => {
    if (state.cityId != null) {
      setSearchQuery("");
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (uf.length !== 2 || q.length < 2) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(q);
    }, 280);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [searchQuery, uf, state.cityId, fetchSuggestions]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function clearCitySelection() {
    patch({ cityId: null, city: "" });
    setSearchQuery("");
    setSuggestions([]);
    setSearchError(null);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function pick(row: CityRow) {
    const st = String(row.state).trim().toUpperCase().slice(0, 2);
    patch({
      cityId: row.id,
      city: row.name,
      state: st.length === 2 ? st : uf,
    });
    setSearchQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  const ufValue = state.state.length === 2 ? state.state.toUpperCase() : "";
  const hasResolvedCity = state.cityId != null && state.city.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>
            Estado (UF) <span className="text-red-500">*</span>
          </span>
          <select
            className={selectClass}
            value={ufValue}
            onChange={(e) => {
              const nextUf = e.target.value;
              patch({ state: nextUf, cityId: null, city: "" });
              setSearchQuery("");
              setSuggestions([]);
              setSearchError(null);
              setOpen(false);
            }}
          >
            <option value="">Selecione a UF</option>
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
            {hasResolvedCity ? (
              <span className="ml-2 text-xs font-normal text-green-700">(selecionada na base)</span>
            ) : null}
          </div>

          {hasResolvedCity ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div
                className={`${selectClass} flex min-h-[48px] items-center font-medium text-[#1D2440]`}
                title={state.city}
              >
                {state.city}
              </div>
              <button
                type="button"
                onClick={clearCitySelection}
                className="shrink-0 rounded-[18px] border border-[#E5E9F2] bg-white px-4 py-2.5 text-sm font-bold text-[#2F67F6] transition hover:bg-[#F9FBFF]"
              >
                Trocar cidade
              </button>
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                className={selectClass}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchError(null);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                disabled={uf.length !== 2}
                placeholder={
                  uf.length !== 2
                    ? "Selecione a UF primeiro"
                    : "Digite ao menos 2 letras e escolha na lista"
                }
                autoComplete="off"
                aria-autocomplete="list"
                aria-expanded={open}
              />
              {loading ? (
                <div className="mt-1 text-xs text-[#6E748A]">Buscando cidades…</div>
              ) : null}
              {searchError ? <p className="mt-1 text-xs text-red-700">{searchError}</p> : null}
              {open &&
              uf.length === 2 &&
              searchQuery.trim().length >= 2 &&
              suggestions.length === 0 &&
              !loading &&
              !searchError ? (
                <p className="mt-1 text-xs text-amber-800">
                  Nenhuma cidade encontrada para esse trecho na base. Ajuste a busca ou a UF.
                </p>
              ) : null}
              {open && suggestions.length > 0 ? (
                <ul
                  className="absolute z-40 mt-1 max-h-52 w-full overflow-auto rounded-[18px] border border-[#E5E9F2] bg-white py-1 shadow-lg"
                  role="listbox"
                >
                  {suggestions.map((row) => (
                    <li key={row.id} role="option">
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
            </>
          )}
        </div>
      </div>

      {!hasResolvedCity && uf.length === 2 ? (
        <p className="text-xs leading-relaxed text-[#6E748A]">
          A cidade precisa ser escolhida na lista (dados oficiais da base). Texto livre não é aceito
          na publicação.
        </p>
      ) : null}
    </div>
  );
}
