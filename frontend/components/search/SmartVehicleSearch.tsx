// frontend/components/search/SmartVehicleSearch.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useSemanticAutocomplete } from "../../hooks/useSemanticAutocomplete";
import { buildSearchUrl } from "../../lib/search/build-search-url";
import type { FlatAutocompleteSuggestion } from "../../lib/search/semantic-autocomplete";

export interface SmartVehicleSearchProps {
  placeholder?: string;
  resultsBasePath?: string;
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
  if (index < 0) return 0;
  if (index > len - 1) return len - 1;
  return index;
}

export function SmartVehicleSearch({
  placeholder = "Digite marca, modelo, cidade ou o que você procura",
  resultsBasePath = "/anuncios",
  currentCitySlug = null,
  className = "",
  minLength = 2,
}: SmartVehicleSearchProps) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    query,
    setQuery,
    isOpen,
    setIsOpen,
    isLoading,
    activeIndex,
    setActiveIndex,
    semanticData,
    flatSuggestions,
    close,
    open,
  } = useSemanticAutocomplete({
    currentCitySlug,
    limit: 8,
    debounceMs: 220,
    minLength,
  });

  const queryTrimmed = useMemo(() => String(query || "").trim(), [query]);

  const applicableFilters = useMemo(
    () => semanticData?.semantic?.applicableFilters || {},
    [semanticData]
  );

  // Mantém o índice sempre válido quando a lista muda (evita "index fora do range")
  useEffect(() => {
    if (!isOpen) return;
    const len = flatSuggestions.length;
    if (len === 0) {
      if (activeIndex !== -1) setActiveIndex(-1);
      return;
    }
    const next = clampIndex(activeIndex, len);
    if (next !== activeIndex) setActiveIndex(next);
  }, [isOpen, flatSuggestions.length, activeIndex, setActiveIndex]);

  // Fecha ao clicar fora (robusto em desktop/mobile)
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

      const activeSuggestion =
        activeIndex >= 0 ? flatSuggestions[activeIndex] : null;

      if (activeSuggestion) {
        handleSuggestionSelect(activeSuggestion);
        return;
      }

      goToSearch(queryTrimmed);
    },
    [
      activeIndex,
      flatSuggestions,
      handleSuggestionSelect,
      goToSearch,
      queryTrimmed,
    ]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const len = flatSuggestions.length;

      // abre ao navegar se já tem texto mínimo
      if (!isOpen || len === 0) {
        if (event.key === "ArrowDown" && queryTrimmed.length >= minLength) {
          event.preventDefault();
          open();
          // quando abrir, começa sem item selecionado
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
        // NOTE: setter pode não aceitar callback, então calcula com valor atual
        const next =
          activeIndex >= len - 1 ? 0 : Math.max(activeIndex, -1) + 1;
        setActiveIndex(next);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const next =
          activeIndex <= 0 ? len - 1 : Math.max(activeIndex, 0) - 1;
        setActiveIndex(next);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      // Enter já é tratado pelo submit do form.
    },
    [
      activeIndex,
      close,
      flatSuggestions.length,
      isOpen,
      minLength,
      open,
      queryTrimmed,
      setActiveIndex,
    ]
  );

  const shouldShowDropdown = isOpen && queryTrimmed.length >= minLength;

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
              // abre automaticamente quando o usuário digita
              setIsOpen(true);
              // reseta seleção ao digitar (evita selecionar sugestão errada)
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
              {(semanticData.semantic.recognized.brand ||
                semanticData.semantic.recognized.model ||
                semanticData.semantic.recognized.city ||
                semanticData.semantic.recognized.priceRange ||
                semanticData.semantic.recognized.belowFipe) && (
                <div className="border-b border-zinc-100 px-4 py-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Reconhecido na busca
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {semanticData.semantic.recognized.brand && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Marca: {semanticData.semantic.recognized.brand}
                      </span>
                    )}

                    {semanticData.semantic.recognized.model && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Modelo: {semanticData.semantic.recognized.model}
                      </span>
                    )}

                    {semanticData.semantic.recognized.city?.name && (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                        Cidade: {semanticData.semantic.recognized.city.name}
                        {semanticData.semantic.recognized.city.state
                          ? ` - ${semanticData.semantic.recognized.city.state}`
                          : ""}
                      </span>
                    )}

                    {semanticData.semantic.recognized.priceRange &&
                      (semanticData.semantic.recognized.priceRange.min !== null ||
                        semanticData.semantic.recognized.priceRange.max !== null) && (
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
                          Preço:
                          {semanticData.semantic.recognized.priceRange.min !== null
                            ? ` de R$ ${semanticData.semantic.recognized.priceRange.min}`
                            : ""}
                          {semanticData.semantic.recognized.priceRange.max !== null
                            ? ` até R$ ${semanticData.semantic.recognized.priceRange.max}`
                            : ""}
                        </span>
                      )}

                    {semanticData.semantic.recognized.belowFipe === true && (
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
                            {suggestion.type === "composed" &&
                              "Sugestão inteligente"}
                            {suggestion.total > 0
                              ? ` • ${suggestion.total} anúncios`
                              : ""}
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
