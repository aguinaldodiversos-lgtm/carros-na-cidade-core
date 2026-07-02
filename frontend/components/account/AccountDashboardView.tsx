"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdsPremiumList from "@/components/account/AdsPremiumList";
import DashboardMetricCards from "@/components/account/DashboardMetricCards";
import DashboardOpportunities from "@/components/account/DashboardOpportunities";
import BoostModal from "@/components/dashboard/BoostModal";
import { fetchDashboardPayloadClient } from "@/lib/dashboard/fetch-dashboard-me-client";
import type { DashboardAd, DashboardPayload } from "@/lib/dashboard-types";

export type AccountDashboardViewMode = "home" | "ads";

type AccountDashboardViewProps = {
  initialData: DashboardPayload;
  variant: "pf" | "lojista";
  mode: AccountDashboardViewMode;
};

export default function AccountDashboardView({
  initialData,
  variant,
  mode,
}: AccountDashboardViewProps) {
  const [data, setData] = useState(initialData);
  const [busyAdId, setBusyAdId] = useState<string | null>(null);
  const [boostAd, setBoostAd] = useState<DashboardAd | null>(null);

  // Lista completa; a busca/filtro/ordenação vivem dentro de AdsPremiumList.
  const allAds = useMemo(
    () => [...data.active_ads, ...data.paused_ads],
    [data.active_ads, data.paused_ads]
  );

  const refreshDashboard = async () => {
    const result = await fetchDashboardPayloadClient();
    if (result.ok) setData(result.payload);
  };

  const updateStatus = async (ad: DashboardAd) => {
    if (busyAdId) return;
    setBusyAdId(ad.id);
    try {
      await fetch(`/api/ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: ad.status === "active" ? "pause" : "activate",
        }),
      });
      await refreshDashboard();
    } finally {
      setBusyAdId(null);
    }
  };

  const firstName = data.user.name.trim().split(/\s+/)[0] || data.user.name;
  const planLabel = data.current_plan?.name ?? data.stats.plan_name;
  const isPaidPlan = Boolean(data.current_plan && data.current_plan.billing_model !== "free");
  const planDetailsHref = variant === "lojista" ? "/dashboard-loja/plano" : "/planos";
  const homeSubtitle =
    variant === "lojista"
      ? "Aqui está o resumo da sua loja hoje."
      : "Aqui está o resumo da sua conta hoje.";

  return (
    <div className="space-y-8" data-testid="dashboard-content" data-user-id={data.user.id}>
      {mode === "home" && (
        <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0f172a] sm:text-3xl">
              Olá, {firstName}! <span aria-hidden>👋</span>
            </h1>
            <p className="mt-1 text-sm text-[#64748b]">{homeSubtitle}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Card compacto de plano — dado real. Status "• Ativo/Grátis" com
                bolinha; "Ver detalhes" como botão outline (igual ao mockup). */}
            <div className="flex items-center gap-4 rounded-2xl border border-[#e8ecf4] bg-white px-4 py-3 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-[#1d2538]">{planLabel}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold ${
                      isPaidPlan ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isPaidPlan ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    />
                    {isPaidPlan ? "Ativo" : "Grátis"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#64748b]">
                  {data.stats.active_ads}
                  {data.stats.plan_limit > 0 ? ` / ${data.stats.plan_limit}` : ""} anúncios ativos
                </p>
              </div>
              <Link
                href={planDetailsHref}
                className="shrink-0 rounded-lg border border-[#dfe4ef] bg-white px-3 py-2 text-xs font-bold text-[#0e62d8] transition hover:bg-[#f0f6ff]"
              >
                Ver detalhes do plano
              </Link>
            </div>

            {/* Botão "Novo anúncio" com split/chevron (visual do mockup). */}
            <Link
              href="/anunciar/novo"
              className="inline-flex h-11 items-center overflow-hidden rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.2)] transition hover:brightness-110"
            >
              <span className="px-5">+ Novo anúncio</span>
              <span className="flex h-full items-center border-l border-white/25 px-2.5" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </Link>
          </div>
        </header>
      )}

      {mode === "ads" && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0f172a]">Meus anúncios</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Gerencie status, impulsionamento e edição dos veículos publicados.
            </p>
          </div>
          <Link
            href="/anunciar/novo"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white"
          >
            + Novo anúncio
          </Link>
        </div>
      )}

      {/* Cards de métrica (ambos variants) — dado real (Fase C) */}
      {mode === "home" && (
        <DashboardMetricCards
          activeAds={data.stats.active_ads}
          planLimit={data.stats.plan_limit}
          totalLeads={data.metrics?.leads ?? 0}
          totalViews={data.stats.total_views}
        />
      )}

      {/* Oportunidades para vender mais (conteúdo estático).
          O gráfico "Desempenho da semana" fica FORA por ora: exige um endpoint
          de série diária por lojista que ainda não existe — não exibimos um
          gráfico permanentemente zerado (ver relatório da Fase C/E). */}
      {mode === "home" && <DashboardOpportunities />}

      {/* Lista de anúncios (toolbar de busca/filtro vive dentro do componente) */}
      <section id="meus-anuncios" className="space-y-4" data-testid="dashboard-ads-list">
        <AdsPremiumList
          ads={allAds}
          busyAdId={busyAdId}
          variant={variant}
          onBoost={setBoostAd}
          onToggleStatus={updateStatus}
        />

        <div className="flex justify-center rounded-2xl border border-dashed border-[#cfd8e8] bg-[#fafbfc] py-6">
          <Link
            href="/anunciar/novo"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#0e62d8] hover:underline"
          >
            <span className="text-xl">+</span> Criar novo anúncio
          </Link>
        </div>
      </section>

      <BoostModal
        open={Boolean(boostAd)}
        ad={boostAd}
        options={data.boost_options}
        onClose={() => setBoostAd(null)}
      />
    </div>
  );
}
