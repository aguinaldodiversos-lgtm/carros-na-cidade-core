// frontend/hooks/useSemanticAutocomplete.ts

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSemanticAutocomplete,
  FlatAutocompleteSuggestion,
  SemanticAutocompleteData,
} from "../lib/search/semantic-autocomplete";

export interface UseSemanticAutocompleteOptions {
  minLength?: number;
  debounceMs?: number;
  limit?: number;
  currentCitySlug?: string | null;
}

export interface UseSemanticAutocompleteResult {
  query: string;
  setQuery: (value: string) => void;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  isLoading: boolean;
  error: string | null;
  activeIndex: number;
  setActiveIndex: (value: number) => void;
  semanticData: SemanticAutocompleteData | null;
  flatSuggestions: FlatAutocompleteSuggestion[];
  open: () => void;
  close: () => void;
  reset: () => void;
}

export function useSemanticAutocomplete(
  options: UseSemanticAutocompleteOptions = {}
): UseSemanticAutocompleteResult {
  const minLength = options.minLength ?? 2;
  const debounceMs = options.debounceMs ?? 250;
  const limit = options.limit ?? 8;
  const currentCitySlug = options.currentCitySlug ?? null;

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [semanticData, setSemanticData] = useState<SemanticAutocompleteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const flatSuggestions = useMemo(() => {
    if (!semanticData) return [];

    return [
      ...semanticData.suggestions.composed,
      ...semanticData.suggestions.brands,
      ...semanticData.suggestions.models,
      ...semanticData.suggestions.cities,
    ].slice(0, limit);
  }, [semanticData, limit]);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const reset = useCallback(() => {
    setSemanticData(null);
    setError(null);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const trimmed = query.trim();

    if (trimmed.length < minLength) {
      setIsLoading(false);
      setSemanticData(null);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchSemanticAutocomplete(trimmed, {
          currentCitySlug,
          limit,
          signal: controller.signal,
        });

        setSemanticData(data);
        setIsOpen(true);
        setActiveIndex(data ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;

        setSemanticData(null);
        setActiveIndex(-1);
        setError(err instanceof Error ? err.message : "Falha ao carregar autocomplete");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [query, minLength, debounceMs, currentCitySlug, limit]);

  return {
    query,
    setQuery,
    isOpen,
    setIsOpen,
    isLoading,
    error,
    activeIndex,
    setActiveIndex,
    semanticData,
    flatSuggestions,
    open,
    close,
    reset,
  };
}
