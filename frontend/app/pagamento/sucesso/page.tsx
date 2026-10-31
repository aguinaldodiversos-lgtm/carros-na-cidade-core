"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PaymentReturn = {
  context: "boost" | "plan";
  status: "pending" | "approved" | "rejected" | "canceled" | string;
  boost_active: boolean;
  product?: string;
};

type ConfirmationState =
  | { stage: "checking" }
  | { stage: "approved"; payment: PaymentReturn }
  | { stage: "pending" }
  | { stage: "failed" }
  | { stage: "unavailable" };

const MAX_CHECKS = 12;
const INTERVAL_MS = 2500;

function PaymentIcon({ variant }: { variant: "success" | "pending" | "failed" }) {
  const success = variant === "success";
  return (
    <span
      className={
        "mx-auto flex h-20 w-20 items-center justify-center rounded-full " +
        (success
          ? "bg-[#e6f7ef] text-[#09834b]"
          : variant === "failed"
            ? "bg-[#fff1f1] text-[#bf3737]"
            : "bg-[#edf4ff] text-[#1463db]")
      }
      aria-hidden="true"
    >
      {success ? (
        <svg className="h-11 w-11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m7.5 12.2 3 3L16.5 9" />
        </svg>
      ) : variant === "failed" ? (
        <svg className="h-11 w-11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6m0 4h.01" />
        </svg>
      ) : (
        <svg className="h-11 w-11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l4 2" />
        </svg>
      )}
    </span>
  );
}

function ConfirmationContent({ state }: { state: ConfirmationState }) {
  if (state.stage === "checking") {
    return (
      <>
        <PaymentIcon variant="pending" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-[#122344] sm:text-3xl">Conferindo seu pagamento</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#5e6c83]">
          Você voltou do Mercado Pago. Estamos consultando a confirmação no sistema antes de exibir o resultado da compra.
        </p>
        <p role="status" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#1764dd]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#1764dd]" />
          Aguardando confirmação...
        </p>
      </>
    );
  }

  if (state.stage === "approved") {
    const isBoost = state.payment.context === "boost";
    return (
      <>
        <PaymentIcon variant="success" />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-[#122344] sm:text-3xl">Pagamento confirmado!</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#53617a] sm:text-base">
          {isBoost
            ? state.payment.boost_active
              ? "Seu Destaque de 7 dias está ativo! O anúncio já recebe a prioridade contratada; a exibição nas páginas pode levar alguns instantes para atualizar."
              : "Recebemos a confirmação do seu pagamento. O Destaque contratado está em processamento e poderá aparecer no anúncio em instantes."
            : "Recebemos a confirmação do pagamento. Os benefícios do plano contratado serão disponibilizados conforme a ativação da sua conta."}
        </p>
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-[#d9eee3] bg-[#f4fcf7] px-4 py-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2e8060]">Sua contratação</p>
          <p className="mt-1 text-sm font-extrabold text-[#14583d]">{isBoost ? "Destaque de 7 dias" : "Plano contratado"}</p>
          <p className="mt-1 text-xs leading-5 text-[#527463]">
            {isBoost && state.payment.boost_active ? "Benefício ativo no anúncio." : "Pagamento aprovado. Acompanhe a ativação pelo painel."}
          </p>
        </div>
      </>
    );
  }

  if (state.stage === "failed") {
    return (
      <>
        <PaymentIcon variant="failed" />
        <h1 className="mt-5 text-2xl font-extrabold text-[#122344] sm:text-3xl">Pagamento não confirmado</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#53617a]">
          O pagamento consta como não aprovado. Confira os detalhes no Mercado Pago antes de realizar outra tentativa.
        </p>
      </>
    );
  }

  return (
    <>
      <PaymentIcon variant="pending" />
      <h1 className="mt-5 text-2xl font-extrabold text-[#122344] sm:text-3xl">
        {state.stage === "pending" ? "Seu pagamento está em análise" : "Não foi possível confirmar o pagamento"}
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#53617a]">
        {state.stage === "pending"
          ? "A confirmação ainda não chegou ao sistema. Caso você já tenha pago, não faça um novo pagamento agora; acompanhe a liberação pelo painel da loja."
          : "Não conseguimos identificar esta transação com segurança nesta sessão. Consulte o comprovante no Mercado Pago e acompanhe seu anúncio no painel. Evite pagar novamente antes de conferir."}
      </p>
    </>
  );
}

export default function PagamentoSucessoPage() {
  const [state, setState] = useState<ConfirmationState>({ stage: "checking" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Mercado Pago Checkout Pro devolve external_reference (preferência)
    // e payment_id/collection_id; nunca confiamos no parâmetro status.
    const reference =
      params.get("external_reference") ||
      params.get("pedido") ||
      params.get("payment_id") ||
      params.get("collection_id") ||
      "";

    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(reference)) {
      setState({ stage: "unavailable" });
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function check() {
      if (cancelled) return;
      attempts += 1;

      try {
        const response = await fetch(
          "/api/payments/return-status?reference=" + encodeURIComponent(reference),
          { method: "GET", credentials: "include", cache: "no-store" }
        );

        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setState({ stage: "unavailable" });
          return;
        }

        if (response.ok) {
          const payment = (await response.json()) as PaymentReturn;
          if (payment.status === "approved") {
            if (!cancelled) setState({ stage: "approved", payment });
            return;
          }
          if (payment.status === "rejected" || payment.status === "canceled") {
            if (!cancelled) setState({ stage: "failed" });
            return;
          }
        }
      } catch {
        // Eventual atraso de webhook ou indisponibilidade temporária da rede.
      }

      if (cancelled) return;
      if (attempts >= MAX_CHECKS) {
        setState({ stage: "pending" });
        return;
      }
      timeout = setTimeout(check, INTERVAL_MS);
    }

    void check();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-[840px] items-start justify-center px-4 py-10 sm:px-6 sm:py-16">
      <section className="w-full rounded-3xl border border-[#e2e9f3] bg-white px-5 py-9 text-center shadow-[0_14px_48px_rgba(20,42,79,0.08)] sm:px-10 sm:py-12">
        <ConfirmationContent state={state} />

        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
          <Link
            href="/dashboard-loja"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1462e7] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#0c50c4]"
          >
            Voltar ao painel da loja
            <span aria-hidden="true">→</span>
          </Link>
          <Link
            href="/dashboard-loja/meus-anuncios"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#cbdcf8] bg-white px-5 py-3 text-sm font-bold text-[#1760d0] transition hover:bg-[#f4f8ff]"
          >
            Ver meus anúncios
          </Link>
        </div>

        <p className="mx-auto mt-6 max-w-lg text-xs leading-5 text-[#8590a3]">
          A confirmação exibida aqui é consultada no sistema do Carros na Cidade. O pagamento é processado pelo Mercado Pago.
        </p>
      </section>
    </main>
  );
}
