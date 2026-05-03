"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Polling pós-checkout: o callback "success" do Mercado Pago volta antes do
 * webhook validar a aprovação no backend. Antes, esta página afirmava
 * "Pagamento aprovado" mesmo quando o webhook ainda não tinha rodado — UX
 * incoerente. Agora ela consulta /api/dashboard/me a cada 3s até confirmar
 * que `current_plan.billing_model` saiu de "free", ou até esgotar o budget
 * (~30s), e só então fixa um estado terminal.
 *
 * Usuário anônimo (sem sessão) cai no estado "approved" imediatamente — não
 * temos como confirmar pelo dashboard, então preservamos a mensagem antiga.
 */

type PollingState = "checking" | "approved" | "still_pending";

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 10;

type DashboardCurrentPlan = {
  id?: string | null;
  billing_model?: "free" | "one_time" | "monthly" | string | null;
} | null;

type DashboardPayload = {
  ok?: boolean;
  current_plan?: DashboardCurrentPlan;
  plan?: DashboardCurrentPlan;
};

function readCurrentPlan(payload: DashboardPayload | null): DashboardCurrentPlan {
  if (!payload) return null;
  return payload.current_plan ?? payload.plan ?? null;
}

function isPaidPlan(plan: DashboardCurrentPlan): boolean {
  if (!plan) return false;
  const model = String(plan.billing_model || "").toLowerCase();
  return model === "monthly" || model === "one_time";
}

export default function PagamentoSucessoPage() {
  const [state, setState] = useState<PollingState>("checking");
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelledRef.current) return;
      attempt += 1;

      try {
        const response = await fetch("/api/dashboard/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401) {
          // Sem sessão: comportamento legado (não conseguimos confirmar).
          if (!cancelledRef.current) setState("approved");
          return;
        }

        if (response.ok) {
          const payload = (await response.json()) as DashboardPayload;
          const plan = readCurrentPlan(payload);
          if (isPaidPlan(plan)) {
            if (!cancelledRef.current) {
              setPlanLabel(plan?.id ? String(plan.id) : null);
              setState("approved");
            }
            return;
          }
        }
      } catch {
        // Erro de rede: continua o polling até esgotar tentativas.
      }

      if (cancelledRef.current) return;

      if (attempt >= MAX_POLL_ATTEMPTS) {
        setState("still_pending");
        return;
      }

      timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelledRef.current = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-3xl px-6 py-20">
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-8 text-center shadow-[0_2px_18px_rgba(10,20,40,0.06)]">
        {state === "checking" ? (
          <>
            <h1 className="text-3xl font-extrabold text-[#1d2538]">
              Validando seu pagamento...
            </h1>
            <p className="mt-2 text-sm text-[#53607b]">
              Recebemos a confirmacao do Mercado Pago. Aguarde alguns segundos enquanto o backend
              registra a ativacao do seu plano.
            </p>
            <div
              role="status"
              aria-live="polite"
              className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#0e62d8]"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#0e62d8]" />
              Conferindo o status no backend
            </div>
          </>
        ) : state === "approved" ? (
          <>
            <h1 className="text-3xl font-extrabold text-[#1d2538]">Pagamento aprovado</h1>
            <p className="mt-2 text-sm text-[#53607b]">
              {planLabel
                ? `Plano ativo: ${planLabel}. Os benefícios já estão disponíveis na sua conta.`
                : "Pagamento confirmado. Os benefícios já estão disponíveis na sua conta."}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/planos"
                className="inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white"
              >
                Voltar para planos
              </Link>
              <Link
                href="/anuncios"
                className="inline-flex h-11 items-center rounded-xl border border-[#dfe4ef] px-5 text-sm font-bold text-[#2d3852]"
              >
                Ir para anuncios
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extrabold text-[#1d2538]">Pagamento em validação</h1>
            <p className="mt-2 text-sm text-[#53607b]">
              O Mercado Pago confirmou o checkout, mas o webhook do backend ainda não terminou de
              processar. A ativacao costuma levar de 1 a 5 minutos. Atualize esta página em alguns
              instantes ou abra o painel para acompanhar.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white"
              >
                Abrir painel
              </Link>
              <Link
                href="/planos"
                className="inline-flex h-11 items-center rounded-xl border border-[#dfe4ef] px-5 text-sm font-bold text-[#2d3852]"
              >
                Voltar para planos
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
