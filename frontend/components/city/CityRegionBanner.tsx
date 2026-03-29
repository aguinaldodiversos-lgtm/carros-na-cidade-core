"use client";

import { useEffect, useState } from "react";

import { useCity } from "@/lib/city/CityContext";
import {
  hasUserConfirmedCity,
  markUserConfirmedCity,
} from "@/lib/city/city-storage";

/**
 * Primeiro acesso: reforça a escolha de cidade (o padrão ainda vem do cookie).
 * Só some após confirmação explícita ou escolha no seletor (grava `CITY_USER_SET_KEY`).
 */
export function CityRegionBanner() {
  const { city, isReady, openCityPicker } = useCity();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (hasUserConfirmedCity()) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [isReady, city.slug]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Confirmação de região"
      className="border-b border-[#C7D8F6] bg-[linear-gradient(90deg,#F0F6FF_0%,#E8F0FE_100%)]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[14px] leading-snug text-[#1d2a44]">
          <span className="font-bold text-[#0e62d8]">Confirme sua região.</span>{" "}
          Os anúncios e buscas usam{" "}
          <strong className="font-semibold">{city.label}</strong>. Se não for a sua cidade, ajuste
          agora.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => {
              markUserConfirmedCity();
              setVisible(false);
            }}
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#B8CCE8] bg-white px-4 text-[13px] font-bold text-[#2F3A52] transition hover:bg-[#f8fafc]"
          >
            Está correto
          </button>
          <button
            type="button"
            onClick={() => openCityPicker()}
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#2F67F6] px-4 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(47,103,246,0.22)] transition hover:bg-[#2457DC]"
          >
            Escolher cidade
          </button>
        </div>
      </div>
    </div>
  );
}
