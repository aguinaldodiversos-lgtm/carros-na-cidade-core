"use client";

/**
 * Card "MEU PLANO" da sidebar (Fase B) — compartilhado pelos dois painéis
 * (lojista e particular) via `variant`.
 *
 * Mostra dado REAL (sem hardcode): nome do plano atual + "anúncios ativos /
 * limite", lidos do payload do dashboard (GET /api/dashboard/me → current_plan
 * + stats). As três ações são NAVEGAÇÃO — não reimplementam lógica:
 *   - lojista: Editar plano / Fazer upgrade / Cancelar plano → /dashboard-loja/plano
 *     (o cancelamento real vive lá, no bloco da Fase A).
 *   - particular (PF): sem assinatura paga a gerenciar → só "Fazer upgrade" →
 *     /planos. Sem "Editar" nem "Cancelar".
 *   - "Cancelar plano" só aparece quando há plano PAGO (billing_model != free).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchDashboardPayloadClient } from "@/lib/dashboard/fetch-dashboard-me-client";
import type { DashboardPayload } from "@/lib/dashboard-types";

type AccountPlanCardProps = {
  variant: "pf" | "lojista";
  basePath: "/dashboard" | "/dashboard-loja";
};

function PlanIcon() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0f4db6_0%,#1381e3_100%)] text-white shadow-[0_6px_16px_rgba(14,98,216,0.28)]">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M12 2.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 8.7l5.9-.8L12 2.5z" />
      </svg>
    </div>
  );
}

export default function AccountPlanCard({ variant, basePath }: AccountPlanCardProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchDashboardPayloadClient().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setData(result.payload);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const managePlanHref = variant === "lojista" ? `${basePath}/plano` : "/planos";

  if (status === "loading") {
    return (
      <div
        className="h-40 animate-pulse rounded-2xl border border-[#e8ecf4] bg-white"
        data-testid="account-plan-card-loading"
      />
    );
  }

  if (status === "error" || !data) {
    // Degrada para um card mínimo com o atalho — nunca some sem deixar caminho.
    return (
      <div className="rounded-2xl border border-[#e8ecf4] bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#94a3b8]">Meu plano</p>
        <Link
          href={managePlanHref}
          className="mt-2 inline-block text-sm font-bold text-[#0e62d8] hover:underline"
        >
          {variant === "lojista" ? "Ver plano e cobranças" : "Ver planos"}
        </Link>
      </div>
    );
  }

  const planName = data.current_plan?.name ?? data.stats.plan_name;
  const isPaid = Boolean(data.current_plan && data.current_plan.billing_model !== "free");
  const activeAds = data.stats.active_ads;
  const planLimit = data.stats.plan_limit;
  // Só oferece "Editar"/"Cancelar" quando há plano pago a gerenciar (lojista).
  const showManage = variant === "lojista" && isPaid;

  return (
    <div className="rounded-2xl border border-[#e8ecf4] bg-white p-4" data-testid="account-plan-card">
      <div className="flex items-center gap-3">
        <PlanIcon />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#94a3b8]">Plano atual</p>
          <p className="truncate text-base font-extrabold text-[#1d2538]">{planName}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-[#eef1f6] pt-3">
        <p className="text-[11px] font-semibold text-[#94a3b8]">Anúncios ativos</p>
        <p className="text-sm font-bold text-[#1d2538]">
          {activeAds}
          {planLimit > 0 ? <span className="text-[#94a3b8]"> / {planLimit}</span> : null}
        </p>
      </div>

      <div className="mt-3 space-y-2 border-t border-[#eef1f6] pt-3">
        {showManage ? (
          <Link
            href={managePlanHref}
            className="flex items-center gap-2 text-sm font-semibold text-[#37425d] hover:text-[#0e62d8]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
            </svg>
            Editar plano
          </Link>
        ) : null}

        <Link
          href={managePlanHref}
          data-testid="account-plan-upgrade"
          className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white transition hover:brightness-110"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
          Fazer upgrade
        </Link>

        {showManage ? (
          <Link
            href={managePlanHref}
            data-testid="account-plan-cancel"
            className="flex items-center gap-2 text-sm font-semibold text-[#b45309] hover:text-[#92400e]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M9 9l6 6m0-6-6 6" />
            </svg>
            Cancelar plano
          </Link>
        ) : null}
      </div>
    </div>
  );
}
