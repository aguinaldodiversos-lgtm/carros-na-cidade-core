"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCity } from "@/lib/city/CityContext";
import { searchCitiesClient, type ApiCityRow } from "@/lib/city/city-search-client";
import { toCityRef } from "@/lib/city/city-types";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

function CityLinkChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-[#2F67F6] transition ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7 4 6 6-6 6" />
    </svg>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

/**
 * Seletor compacto no header: busca + autocomplete (BFF /api/cities/search) e salva via City Engine.
 */
export function CityHeaderSelector() {
  const { city, setCity, openCityPicker } = useCity();
  const [open, setOpen] = useState(false);
  const [uf, setUf] = useState(city.state || "SP");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setUf(city.state || "SP");
  }, [city.state]);
  const debouncedQ = useDebouncedValue(query, 280);
  const [results, setResults] = useState<ApiCityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debouncedQ.trim().length < 2) {
      setResults([]);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    void searchCitiesClient(debouncedQ, uf, { signal: ac.signal })
      .then((rows) => {
        if (!ac.signal.aborted) setResults(rows);
      })
      .catch(() => {
        if (!ac.signal.aborted) setResults([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
  }, [open, debouncedQ, uf]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback(
    (raw: ApiCityRow) => {
      const ref = toCityRef({
        id: raw.id,
        slug: raw.slug,
        name: raw.name,
        state: raw.state,
      });
      if (ref) {
        setCity(ref);
        setOpen(false);
        setQuery("");
        setResults([]);
      }
    },
    [setCity]
  );

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] font-semibold text-[#2F3A52] transition hover:bg-[#F4F7FB]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Cidade ativa: ${city.label}. Abrir busca de cidade`}
      >
        <span className="max-w-[140px] truncate">{city.name}</span>
        <CityLinkChevronIcon open={open} />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-[60] mt-1 w-[min(100vw-2rem,420px)] rounded-[14px] border border-[#E5E9F2] bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
          role="listbox"
        >
          <div className="grid gap-2 sm:grid-cols-[minmax(0,88px)_1fr]">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-[#64748b]">UF</span>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-[#E5E9F2] bg-white px-2 text-[13px] font-medium text-[#33405A] outline-none focus:border-[#1F66E5]"
              >
                {BRAZIL_UFS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-1">
              <span className="mb-1 block text-[11px] font-semibold text-[#64748b]">Cidade</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite para buscar…"
                className="h-10 w-full rounded-[10px] border border-[#E5E9F2] bg-white px-3 text-[14px] text-[#33405A] outline-none placeholder:text-[#9aa3b8] focus:border-[#1F66E5]"
                autoComplete="off"
                autoFocus
              />
            </label>
          </div>

          <div className="mt-2 max-h-52 overflow-y-auto rounded-[10px] border border-[#EEF1F6] bg-[#fafbfd]">
            {loading ? (
              <p className="px-3 py-2 text-[13px] text-[#64748b]">Buscando…</p>
            ) : debouncedQ.trim().length >= 2 && results.length === 0 ? (
              <p className="px-3 py-2 text-[13px] text-[#64748b]">Nenhuma cidade encontrada.</p>
            ) : (
              <ul className="py-1">
                {results.map((c) => {
                  const label = [c.name, c.state].filter(Boolean).join(" — ");
                  return (
                    <li key={`${c.slug}-${c.id ?? ""}`}>
                      <button
                        type="button"
                        role="option"
                        onClick={() => pick(c)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] font-semibold text-[#33405A] transition hover:bg-white hover:shadow-sm"
                      >
                        <span>{label}</span>
                        <span className="text-[12px] font-medium text-[#1F66E5]">Usar</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openCityPicker();
            }}
            className="mt-2 w-full rounded-[10px] border border-[#E5E9F2] bg-[#F8FAFC] py-2 text-[13px] font-semibold text-[#47506A] transition hover:bg-[#f1f5f9]"
          >
            Ver todas as cidades…
          </button>
        </div>
      ) : null}
    </div>
  );
}
