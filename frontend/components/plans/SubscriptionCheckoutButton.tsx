"use client";

/**
 * Botão de checkout de ASSINATURA recorrente (Start/Pro) na área do lojista.
 *
 * Replica o padrão comprovado de `handleSubscribe` em
 * components/painel/PublicationPlanSelector.tsx (o mesmo formato do boost):
 *   POST /api/payments/subscriptions/checkout  → redireciona para init_point.
 *
 * Frontend NÃO calcula preço nem fala com o Mercado Pago no render — só dispara
 * o checkout no clique e segue o init_point devolvido pelo backend. O preço/
 * whitelist do plano são validados no servidor.
 *
 * Em produção, o BFF /api/payments/subscriptions/checkout fica atrás da flag
 * SUBSCRIPTIONS_LIVE (retorna 503 quando desligada); nesse caso o erro é
 * exibido inline — o usuário NÃO é jogado para a home.
 */

import { useState } from "react";

type SubscriptionCheckoutButtonProps = {
  planId: "cnpj-store-start" | "cnpj-store-pro";
  label: string;
  variant?: "primary" | "outline";
};

const PRIMARY = "#0e62d8";

export default function SubscriptionCheckoutButton({
  planId,
  label,
  variant = "primary",
}: SubscriptionCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payments/subscriptions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        init_point?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
          window.location.assign(`/login?next=${next}`);
          return;
        }
        setError(body.error ?? "Não foi possível iniciar a assinatura.");
        setLoading(false);
        return;
      }
      if (body.init_point) {
        // Redireciona ao Mercado Pago — mesmo comportamento do boost/destaque.
        window.location.href = body.init_point;
        return;
      }
      setError("Resposta inesperada do checkout.");
      setLoading(false);
    } catch {
      setError("Falha de rede ao iniciar a assinatura.");
      setLoading(false);
    }
  }

  const baseClass =
    "mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60";
  const variantClass =
    variant === "primary"
      ? "bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-white hover:brightness-110"
      : "border-2 bg-white hover:bg-[#f4f8ff]";
  const variantStyle = variant === "outline" ? { color: PRIMARY, borderColor: PRIMARY } : undefined;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        data-testid={`subscribe-${planId}`}
        className={`${baseClass} ${variantClass}`}
        style={variantStyle}
      >
        {loading ? "Abrindo Mercado Pago…" : label}
      </button>
      {error ? (
        <p
          className="mt-2 rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
