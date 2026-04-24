"use client";

import { useCallback } from "react";

import { IconHeart } from "@/components/home/icons";
import { useFavorites } from "@/lib/favorites/FavoritesContext";

export function VehicleFavoriteButton({ favKey }: { favKey: string }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(favKey);

  const onToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(favKey);
    },
    [favKey, toggleFavorite]
  );

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={fav}
      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[#2d3a9c] shadow ring-1 ring-black/5 transition hover:scale-105 sm:right-2.5 sm:top-2.5 sm:h-8 sm:w-8"
    >
      <IconHeart className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill={fav ? "currentColor" : "none"} />
    </button>
  );
}
