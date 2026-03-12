"use client";

import Link from "next/link";
import { useEffect } from "react";

type ExitIntentModalProps = {
  city: string;
  onClose?: () => void;
};

export default function ExitIntentModal({ city, onClose }: ExitIntentModalProps) {
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0f1c35]/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-2xl font-extrabold text-[#1d2538]">Antes de sair...</h3>
        <p className="mt-2 text-[16px] text-[#56607a]">
          Encontramos ofertas em destaque para {city}. Quer ver os anuncios agora?
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl border border-[#d8deea] px-4 text-[15px] font-bold text-[#2f3a53]"
          >
            Fechar
          </button>
          <Link
            href="/anuncios"
            className="inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-[15px] font-bold text-white"
          >
            Ver anuncios
          </Link>
        </div>
      </div>
    </div>
  );
}
