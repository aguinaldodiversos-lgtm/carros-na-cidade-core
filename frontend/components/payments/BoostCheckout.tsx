"use client";

import { useMemo, useState } from "react";
import { trackAdEvent } from "@/lib/analytics/public-events";
import type { BoostOption } from "@/lib/dashboard-types";

type BoostCheckoutProps = {
  adId: string;
  options: BoostOption[];
  defaultOptionId?: string;
};

type CheckoutResponse = {
  error?: string;
  init_point?: string;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function BoostCheckout({ adId, options, defaultOptionId }: BoostCheckoutProps) {
  const initialOption = useMemo(
    () => options.find((option) => option.id === defaultOptionId) ?? options[0] ?? null,
    [defaultOptionId, options]
  );

  const [selectedOptionId, setSelectedOptionId] = useState(initialOption?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedOption = options.find((option) => option.id === selectedOptionId) ?? null;

  const startPayment = async () => {
    if (!selectedOption || loading) return;

    setLoading(true);
    setError("");

    try {
      trackAdEvent(adId, "boost_start");
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ad_id: adId,
          boost_option_id: selectedOption.id,
        }),
      });

      const payload = (await response.json()) as CheckoutResponse;
      if (!response.ok || !payload.init_point) {
        setError(payload.error ?? "Falha ao criar checkout.");
        setLoading(false);
        return;
      }

      window.location.assign(payload.init_point);
    } catch {
      setError("Falha na conexao com o checkout.");
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_4px_24px_rgba(10,20,40,0.07)]">
      <h2 className="text-xl font-extrabold text-[#1d2538]">Escolha o tipo de destaque</h2>

      <div className="mt-4 space-y-2">
        {options.map((option) => {
          const selected = option.id === selectedOptionId;
          return (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                selected ? "border-[#0e62d8] bg-[#eef4ff]" : "border-[#dfe4ef] bg-white hover:bg-[#f9fbff]"
              }`}
            >
              <input
                type="radio"
                name="boost-option"
                value={option.id}
                checked={selected}
                onChange={() => setSelectedOptionId(option.id)}
                className="mt-1 h-4 w-4 border-[#9fb5e4] text-[#0e62d8] focus:ring-[#0e62d8]"
              />
              <span className="flex-1">
                <span className="block text-sm font-extrabold text-[#1f2a45]">{option.label}</span>
                <span className="mt-0.5 block text-xs text-[#5b6680]">{option.description}</span>
              </span>
              <strong className="text-base font-extrabold text-[#0e62d8]">{formatPrice(option.price)}</strong>
            </label>
          );
        })}
      </div>

      {selectedOption && (
        <div className="mt-4 rounded-xl border border-[#dce4f2] bg-[#f7faff] p-3 text-sm text-[#42506e]">
          <p>
            Plano selecionado: <strong>{selectedOption.label}</strong>
          </p>
          <p>
            Valor: <strong>{formatPrice(selectedOption.price)}</strong>
          </p>
        </div>
      )}

      {error && <p className="mt-3 rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]">{error}</p>}

      <button
        type="button"
        onClick={startPayment}
        disabled={!selectedOption || loading}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-base font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Abrindo checkout..." : "Pagar"}
      </button>
    </div>
  );
}
