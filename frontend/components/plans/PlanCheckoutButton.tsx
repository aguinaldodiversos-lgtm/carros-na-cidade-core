"use client";

import { useState } from "react";

type PlanCheckoutButtonProps = {
  endpoint: "/api/payments/create" | "/api/payments/subscription";
  planId: string;
  label: string;
};

export default function PlanCheckoutButton({ endpoint, planId, label }: PlanCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: planId,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
          window.location.assign(`/login?next=${next}`);
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Nao foi possivel iniciar o checkout.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as { init_point?: string };
      if (payload.init_point) {
        window.location.href = payload.init_point;
        return;
      }
      setLoading(false);
    } catch {
      setError("Falha na conexao com o checkout.");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Abrindo Mercado Pago..." : label}
      </button>
      {error ? (
        <p className="mt-3 rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]">
          {error}
        </p>
      ) : null}
    </>
  );
}
