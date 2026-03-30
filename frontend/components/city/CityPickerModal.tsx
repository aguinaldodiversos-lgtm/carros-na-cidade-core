"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useCity } from "@/lib/city/CityContext";
import { searchCitiesClient } from "@/lib/city/city-search-client";
import type { CityRef } from "@/lib/city/city-types";
import { buildCityLabel, toCityRef } from "@/lib/city/city-types";
import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import Link from "next/link";
import { SITE_ROUTES } from "@/lib/site/site-navigation";

type ApiCity = {
  id?: number;
  name?: string;
  slug?: string;
  state?: string;
  demand_score?: number;
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function CityPickerModal() {
  const { cityPickerOpen, closeCityPicker, setCity, city: activeCity } = useCity();
  const [uf, setUf] = useState("SP");
  const [query, setQuery] = useState("");
  const debouncedQ = useDebouncedValue(query, 320);
  const [featured, setFeatured] = useState<ApiCity[]>([]);
  const [results, setResults] = useState<ApiCity[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);

  useEffect(() => {
    if (!cityPickerOpen) return;
    setLoadingFeatured(true);
    void fetch("/api/cities")
      .then((r) => r.json() as Promise<{ success?: boolean; data?: ApiCity[] }>)
      .then((j) => {
        setFeatured(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => setFeatured([]))
      .finally(() => setLoadingFeatured(false));
  }, [cityPickerOpen]);

  useEffect(() => {
    if (!cityPickerOpen) return;
    if (debouncedQ.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoadingSearch(true);
    void searchCitiesClient(debouncedQ, uf, { limit: 20 })
      .then((rows) => setResults(rows as ApiCity[]))
      .catch(() => setResults([]))
      .finally(() => setLoadingSearch(false));
  }, [cityPickerOpen, debouncedQ, uf]);

  const pick = useCallback(
    (raw: ApiCity) => {
      const ref = toCityRef({
        id: raw.id,
        slug: raw.slug,
        name: raw.name,
        state: raw.state,
      });
      if (ref) setCity(ref);
    },
    [setCity]
  );

  const title = useMemo(
    () => (
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#1F66E5]">
          Sua cidade no Carros na Cidade
        </p>
        <h2
          id="city-picker-title"
          className="mt-1 text-[22px] font-extrabold tracking-tight text-[#1D2440]"
        >
          Onde você quer comprar ou vender?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#6E748A]">
          A busca e os anúncios passam a refletir o território escolhido. Você pode alterar quando
          quiser.
        </p>
      </div>
    ),
    []
  );

  if (!cityPickerOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-[rgba(15,23,42,0.45)] p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="city-picker-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={closeCityPicker}
      />

      <div className="relative z-[1] max-h-[min(92vh,720px)] w-full max-w-lg overflow-hidden rounded-[22px] border border-[#E5E9F2] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]">
        <div className="max-h-[inherit] overflow-y-auto">
          <div className="relative border-b border-[#F0F3F8] px-5 py-4 md:px-6">
            {title}
            <button
              type="button"
              onClick={closeCityPicker}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#475569] md:right-4 md:top-4"
              aria-label="Fechar seletor de cidade"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="space-y-5 px-5 py-4 md:px-6">
            <div>
              <p className="text-[13px] font-semibold text-[#47506A]">Cidade ativa agora</p>
              <p className="mt-1 text-[16px] font-bold text-[#1D2440]">{activeCity.label}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#64748b]">UF</span>
                <select
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="h-11 w-full rounded-[12px] border border-[#E5E9F2] bg-white px-3 text-[14px] font-medium text-[#33405A] outline-none focus:border-[#1F66E5]"
                >
                  {BRAZIL_UFS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1.5 block text-[12px] font-semibold text-[#64748b]">
                  Buscar cidade
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex.: Campinas, Santos…"
                  className="h-11 w-full rounded-[12px] border border-[#E5E9F2] bg-white px-3 text-[15px] text-[#33405A] outline-none placeholder:text-[#9aa3b8] focus:border-[#1F66E5]"
                  autoComplete="off"
                />
              </label>
            </div>

            {debouncedQ.trim().length >= 2 ? (
              <div>
                <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
                  Resultados
                </p>
                {loadingSearch ? (
                  <p className="text-sm text-[#64748b]">Buscando…</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-[#64748b]">
                    Nenhuma cidade encontrada para esse trecho.
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-[14px] border border-[#EEF1F6] bg-[#fafbfd] p-2">
                    {results.map((c) => {
                      const ref =
                        toCityRef({
                          id: c.id,
                          slug: c.slug,
                          name: c.name,
                          state: c.state,
                        }) ||
                        ({
                          slug: String(c.slug),
                          name: String(c.name),
                          state: String(c.state || uf),
                          label: buildCityLabel(String(c.name), String(c.state || uf)),
                        } as CityRef);
                      return (
                        <li key={`${c.slug}-${c.id ?? ""}`}>
                          <button
                            type="button"
                            onClick={() => pick(c)}
                            className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[14px] font-semibold text-[#33405A] transition hover:bg-white hover:shadow-sm"
                          >
                            <span>{ref.label}</span>
                            <span className="text-[12px] font-medium text-[#1F66E5]">Usar</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[#94a3b8]">
                Em destaque
              </p>
              {loadingFeatured ? (
                <p className="text-sm text-[#64748b]">Carregando cidades…</p>
              ) : featured.length === 0 ? (
                <p className="text-sm text-[#64748b]">
                  Use a busca acima para encontrar sua cidade.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {featured.map((c) => (
                    <li key={c.slug}>
                      <button
                        type="button"
                        onClick={() => pick(c)}
                        className="inline-flex rounded-full border border-[#E5E9F2] bg-[#F8FAFC] px-3 py-1.5 text-[13px] font-semibold text-[#33405A] transition hover:border-[#CFD9F0] hover:bg-white"
                      >
                        {c.name}
                        {c.state ? ` (${c.state})` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-[#F0F3F8] pt-4">
              <Link
                href={SITE_ROUTES.seguranca}
                onClick={closeCityPicker}
                className="text-[13px] font-semibold text-[#64748b] hover:text-[#1F66E5]"
              >
                Por que a cidade importa na negociação →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
