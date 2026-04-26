"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  getFavoriteSlugs,
  toggleFavoriteSlug as toggleFavoriteSlugRaw,
} from "@/lib/favorites/local-favorites";

type FavoritesContextValue = {
  favorites: ReadonlySet<string>;
  isFavorite: (slug: string) => boolean;
  toggleFavorite: (slug: string) => boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const favoritesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Hidrata 1x no mount.
    favoritesRef.current = new Set(getFavoriteSlugs());
    setVersion((v) => v + 1);

    const refresh = () => {
      favoritesRef.current = new Set(getFavoriteSlugs());
      setVersion((v) => v + 1);
    };

    window.addEventListener("cnc-favorites-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("cnc-favorites-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const isFavorite = useCallback(
    (slug: string) => {
      if (!slug) return false;
      return favoritesRef.current.has(slug);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );

  const toggleFavorite = useCallback((slug: string) => {
    const next = toggleFavoriteSlugRaw(slug);
    // O evento cnc-favorites-changed disparado dentro de toggleFavoriteSlugRaw
    // re-hidrata via listener; forcamos aqui para nao depender da ordem.
    favoritesRef.current = new Set(getFavoriteSlugs());
    setVersion((v) => v + 1);
    return next;
  }, []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites: favoritesRef.current,
      isFavorite,
      toggleFavorite,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, isFavorite, toggleFavorite]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (ctx) return ctx;
  // Fallback para quando um botao de favoritos eh montado fora do provider
  // (degrada para localStorage direto; nao quebra a UI).
  return {
    favorites: EMPTY_SET,
    isFavorite: (slug: string) => {
      if (typeof window === "undefined") return false;
      return getFavoriteSlugs().includes(slug);
    },
    toggleFavorite: (slug: string) => toggleFavoriteSlugRaw(slug),
  };
}

export function useIsFavorite(slug: string): boolean {
  const { isFavorite } = useFavorites();
  return isFavorite(slug);
}
