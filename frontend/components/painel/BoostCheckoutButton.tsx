"use client";

import { useState } from "react";

/**
 * Botão de checkout do Destaque 7 dias (Fase 3B).
 *
 * Aciona POST /api/payments/boost-7d/checkout — endpoint dedicado que
 * fixa boost-7d no servidor e nunca aceita preço/dias do cliente.
 *
 * USO RESTRITO ao painel do anúncio (frontend/app/painel/anuncios/...
 * ou similar). NÃO usar em /planos: lá não há ad_id, o CTA aponta para
 * /ajuda?assunto=destaque-7-dias até o usuário ter um anúncio.
 *
 * 401 → redireciona para /login?next= preservando contexto.
 * 200 → window.location.href = init_point (Mercado Pago).
 */

type BoostCheckoutButtonProps = {
  /** ID do anúncio do qual o user é dono. Validado novamente no backend. */
  adId: string | number;
  /** Texto do botão. Default: "Destacar por 7 dias — R$ 39,90" */
  label?: string;
  /** Variante visual — só afeta classes locais, não toca design system global. */
  variant?: "primary" | "subtle";
  /** Override opcional de redirect pós-pagamento. */
  successUrl?: string;
  failureUrl?: string;
  pendingUrl?: string;
};

const ENDPOINT = "/api/payments/boost-7d/checkout";

export default function BoostCheckoutButton({
  adId,
  label = "Destacar por 7 dias — R$ 39,90",
  variant = "primary",
  successUrl,
  failureUrl,
  pendingUrl,
}: BoostCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const styleByVariant = {
    primary:
      "bg-[linear-gradient(120deg,#f59e0b_0%,#f97316_100%)] text-white hover:brightness-110",
    subtle:
      "bg-white text-cnc-warning border border-cnc-warning hover:bg-cnc-warning/5",
  };

  const handleClick = async () => {
    if (loading) return;
    if (!adId) {
      setError("ID do anúncio ausente — recarregue a página.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = { ad_id: String(adId) };
      if (successUrl) body.success_url = successUrl;
      if (failureUrl) body.failure_url = failureUrl;
      if (pendingUrl) body.pending_url = pendingUrl;

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
          window.location.assign(`/login?next=${next}`);
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Não foi possível iniciar o destaque.");
        setLoading(false);
        return;
      }

      const payload = (await response.json()) as {
        init_point?: string;
        ad_id?: string;
        boost_option_id?: string;
      };
      if (payload.init_point) {
        window.location.href = payload.init_point;
        return;
      }
      setLoading(false);
    } catch {
      setError("Falha na conexão com o checkout.");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        data-boost-cta="boost-7d"
        data-ad-id={String(adId)}
        className={`inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${styleByVariant[variant]}`}
      >
        {loading ? "Abrindo Mercado Pago..." : label}
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
