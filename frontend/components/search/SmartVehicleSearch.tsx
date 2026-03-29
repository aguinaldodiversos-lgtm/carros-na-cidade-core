// frontend/components/search/SmartVehicleSearch.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useCityOptional } from "@/lib/city/CityContext";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";
import { useSemanticAutocomplete } from "../../hooks/useSemanticAutocomplete";
import { buildSearchUrl } from "../../lib/search/build-search-url";
import type { FlatAutocompleteSuggestion } from "../../lib/search/semantic-autocomplete";

export interface SmartVehicleSearchProps {
  placeholder?: string;
  resultsBasePath?: string;
  /** Se omitido, usa `useCity().city.slug` após hidratação; senão, cidade padrão pública. */
  currentCitySlug?: string | null;
  className?: string;
  minLength?: number;
}

function getSuggestionIcon(type: FlatAutocompleteSuggestion["type"]) {
  switch (type) {
    case "brand":
      return "🏷️";
    case "model":
      return "🚘";
    case "city":
      return "📍";
    case "composed":
    default:
      return "✨";
  }
}

function clampIndex(index: number, len: number) {
  if (len <= 0) return -1;
  if (index < -1) return -1;
  if (index > len - 1) return len - 1;
  return index;
}

function wrapDown(current: number, len: number) {
  if (len <= 0) return -1;
  // -1 -> 0
  if (current < 0) return 0;
  // last -> 0
  if (current >= len - 1) return 0;
  return current + 1;
}

function wrapUp(current: number, len: number) {
  if (len <= 0) return -1;
  // -1 -> last
  if (current < 0) return len - 1;
  // 0 -> last
  if (current <= 0) return len - 1;
  return current - 1;
}

export function SmartVehicleSearch({
  placeholder = "Digite marca, modelo, cidade ou o que você procura",
  resultsBasePath = "/anuncios",
  currentCitySlug,
  className = "",
  minLength = 2,
}: SmartVehicleSearchProps) {
  const router = useRouter();
  const cityCtx = useCityOptional();
  const effectiveCitySlug = useMemo(() => {
    if (currentCitySlug != null && String(currentCitySlug).trim() !== "") {
      return String(currentCitySlug).trim();
    }
    if (cityCtx?.isReady) {
      return cityCtx.city.slug;
    }
    return DEFAULT_PUBLIC_CITY_SLUG;
  }, [currentCitySlug, cityCtx?.isReady, cityCtx?.city.slug]);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    query,
    setQuery,
    isOpen,
    setIsOpen,
    isLoading,
    activeIndex,
    setActiveIndex, // IMPORTANT: setter recebe number (sem callback)
    semanticData,
    flatSuggestions,
    close,
    open,
  } = useSemanticAutocomplete({
    currentCitySlug: effectiveCitySlug,
    limit: 8,
    debounceMs: 220,
    minLength,
  });

  const queryTrimmed = useMemo(() => String(query || "").trim(), [query]);

  const applicableFilters = useMemo(
    () => semanticData?.semantic?.applicableFilters || {},
    [semanticData]
  );

  const recognized = semanticData?.semantic?.recognized;
  const hasRecognized =
    !!recognized?.brand ||
    !!recognized?.model ||
    !!recognized?.city ||
    !!recognized?.priceRange ||
    recognized?.belowFipe === true;

  const shouldShowDropdown = isOpen && queryTrimmed.length >= minLength;
  const suggestionsLen = flatSuggestions.length;

  // Mantém activeIndex válido quando a lista muda (evita index fora do range)
  useEffect(() => {
    if (!shouldShowDropdown) {
      if (activeIndex !== -1) setActiveIndex(-1);
      return;
    }
    const next = clampIndex(activeIndex, suggestionsLen);
    if (next !== activeIndex) setActiveIndex(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowDropdown, suggestionsLen, activeIndex, setActiveIndex]);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      close();
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [close]);

  const goToSearch = useCallback(
    (rawQuery: string) => {
      const url = buildSearchUrl({
        basePath: resultsBasePath,
        q: rawQuery,
        filters: applicableFilters,
      });

      router.push(url);
      close();
    },
    [router, close, resultsBasePath, applicableFilters]
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: FlatAutocompleteSuggestion) => {
      if (suggestion.path) {
        router.push(suggestion.path);
        close();
        return;
      }

      const mergedFilters = {
        ...applicableFilters,
        ...(suggestion.brand ? { brand: suggestion.brand } : {}),
        ...(suggestion.model ? { model: suggestion.model } : {}),
        ...(suggestion.slug ? { city_slug: suggestion.slug } : {}),
        ...(suggestion.city ? { city: suggestion.city } : {}),
      };

      const url = buildSearchUrl({
        basePath: resultsBasePath,
        q: queryTrimmed,
        filters: mergedFilters,
      });

      router.push(url);
      close();
    },
    [router, close, resultsBasePath, applicableFilters, queryTrimmed]
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (activeIndex >= 0 && activeIndex < flatSuggestions.length) {
        const activeSuggestion = flatSuggestions[activeIndex];
        if (activeSuggestion) {
          handleSuggestionSelect(activeSuggestion);
          return;
        }
      }

      goToSearch(queryTrimmed);
    },
    [activeIndex, flatSuggestions, handleSuggestionSelect, goToSearch, queryTrimmed]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const len = flatSuggestions.length;

      // Se dropdown ainda não está pronto, apenas abre/fecha
      if (!shouldShowDropdown || len === 0) {
        if (event.key === "ArrowDown" && queryTrimmed.length >= minLength) {
          event.preventDefault();
          open();
          setActiveIndex(-1);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = wrapDown(activeIndex, len);
        setActiveIndex(next);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next = wrapUp(activeIndex, len);
        setActiveIndex(next);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      // Enter é tratado no submit do form
    },
    [
      activeIndex,
      close,
      flatSuggestions,
      minLength,
      open,
      queryTrimmed,
      setActiveIndex,
      shouldShowDropdown,
    ]
  );

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      <form onSubmit={handleSubmit} className="w-full" role="search">
        <div className="flex w-full items-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              if (queryTrimmed.length >= minLength) open();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-14 w-full rounded-l-2xl border-0 px-5 text-base outline-none"
            autoComplete="off"
            spellCheck={false}
            aria-expanded={shouldShowDropdown}
            aria-controls="smart-vehicle-search-listbox"
            aria-autocomplete="list"
          />

          <button
            type="submit"
            className="mr-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Buscar
          </button>
        </div>
      </form>

      {shouldShowDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          {isLoading && (
            <div className="px-4 py-4 text-sm text-zinc-500">
              Buscando sugestões...
            </div>
          )}

          {!isLoading && flatSuggestions.length === 0 && (
            <div className="px-4 py-4 text-sm text-zinc-500">
              Nenhuma sugestão encontrada.
            </div>
          )}

          {!isLoading && semanticData && (
            <>
              {hasRecognized && (
                <div className="border-b border-zinc-100 px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Reconhecido na busca
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {recognized?.brand && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Marca: {recognized.brand}
                      </span>
                    )}

                    {recognized?.model && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Modelo: {recognized.model}
                      </span>
                    )}

                    {recognized?.city?.name && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Cidade: {recognized.city.name}
                        {recognized.city.state ? ` - ${recognized.city.state}` : ""}
                      </span>
                    )}

                    {recognized?.priceRange &&
                      (recognized.priceRange.min !== null ||
                        recognized.priceRange.max !== null) && (
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                          Preço:
                          {recognized.priceRange.min !== null
                            ? ` de R$ ${recognized.priceRange.min}`
                            : ""}
                          {recognized.priceRange.max !== null
                            ? ` até R$ ${recognized.priceRange.max}`
                            : ""}
                        </span>
                      )}

                    {recognized?.belowFipe === true && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Abaixo da FIPE
                      </span>
                    )}
                  </div>
                </div>
              )}

              <ul
                id="smart-vehicle-search-listbox"
                className="max-h-[420px] overflow-y-auto py-2"
                role="listbox"
              >
                {flatSuggestions.map((suggestion, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <li
                      key={`${suggestion.type}-${suggestion.label}-${index}`}
                      role="option"
                      aria-selected={isActive}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                          isActive ? "bg-blue-50" : "bg-white hover:bg-zinc-50"
                        }`}
                      >
                        <span className="mt-0.5 text-base">
                          {getSuggestionIcon(suggestion.type)}
                        </span>

                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-zinc-900">
                            {suggestion.label}
                          </span>

                          <span className="mt-1 text-xs text-zinc-500">
                            {suggestion.type === "brand" && "Marca"}
                            {suggestion.type === "model" && "Modelo"}
                            {suggestion.type === "city" && "Cidade"}
                            {suggestion.type === "composed" && "Sugestão inteligente"}
                            {suggestion.total > 0 ? ` • ${suggestion.total} anúncios` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
