"use client";

import Link from "next/link";
import type { BoostOption, DashboardAd } from "@/lib/dashboard-types";

type BoostModalProps = {
  open: boolean;
  ad: DashboardAd | null;
  options: BoostOption[];
  onClose: () => void;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function BoostModal({ open, ad, options, onClose }: BoostModalProps) {
  if (!open || !ad) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#07142f]/55 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_20px_50px_rgba(10,20,45,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#5f6982]">
              Impulsionamento
            </p>
            <h3 className="mt-1 text-lg font-extrabold text-[#1d2538]">{ad.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe4ef] text-[#4d5872] hover:bg-[#f5f8fe]"
            aria-label="Fechar modal"
          >
            x
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {options.map((option) => (
            <div key={option.id} className="rounded-xl border border-[#dce3f0] bg-[#f8fafe] p-3">
              <p className="text-sm font-bold text-[#21304f]">{option.label}</p>
              <p className="mt-0.5 text-xs text-[#5a6580]">{option.description}</p>
              <p className="mt-1 text-base font-extrabold text-[#0e62d8]">
                {formatPrice(option.price)}
              </p>
            </div>
          ))}
        </div>

        <Link
          href={`/impulsionar/${ad.id}`}
          onClick={onClose}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#f15a24_0%,#f1892f_100%)] text-sm font-bold text-white transition hover:brightness-110"
        >
          Ir para pagamento
        </Link>
      </div>
    </div>
  );
}
