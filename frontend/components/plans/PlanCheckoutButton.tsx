"use client";

import { useState } from "react";

type PlanCheckoutButtonProps = {
  endpoint: "/api/payments/create" | "/api/payments/subscription";
  planId: string;
  userId: string;
  label: string;
};

export default function PlanCheckoutButton({ endpoint, planId, userId, label }: PlanCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          plan_id: planId,
        }),
      });

      if (!response.ok) {
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
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? "Abrindo Mercado Pago..." : label}
    </button>
  );
}
