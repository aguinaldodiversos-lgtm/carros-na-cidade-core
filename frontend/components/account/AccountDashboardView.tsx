"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdsPremiumList from "@/components/account/AdsPremiumList";
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
  const [tab, setTab] = useState<"todos" | "ativos" | "pausados">("todos");

  const allAds = useMemo(
    () => [...data.active_ads, ...data.paused_ads],
    [data.active_ads, data.paused_ads]
  );

  const filteredAds = useMemo(() => {
    if (tab === "ativos") return data.active_ads;
    if (tab === "pausados") return data.paused_ads;
    return allAds;
  }, [tab, data.active_ads, data.paused_ads, allAds]);

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
  const accountBadge = variant === "pf" ? "Pessoa física · CPF" : "Lojista · CNPJ";

  return (
    <div className="space-y-8">
      {mode === "home" && (
        <header className="space-y-2">
          <p className="text-sm font-semibold text-[#6b7280]">{accountBadge}</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0f172a] sm:text-3xl">
            Olá, {firstName}!
          </h1>
          <p className="max-w-2xl text-sm text-[#64748b]">
            Plano atual: <span className="font-semibold text-[#334155]">{planLabel}</span>
            {data.stats.plan_limit > 0 ? (
              <>
                {" "}
                · Limite de anúncios ativos:{" "}
                <span className="font-semibold text-[#334155]">{data.stats.plan_limit}</span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/anunciar/novo"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.2)] transition hover:brightness-110"
            >
              + Novo anúncio
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

      {/* Resumo */}
      {mode === "home" && variant === "pf" && (
        <section className="rounded-2xl border border-[#e8ecf4] bg-white p-6 shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#64748b]">Resumo rápido</p>
              <p className="mt-2 text-3xl font-extrabold text-[#0f172a]">
                {data.stats.active_ads}{" "}
                <span className="text-lg font-bold text-[#64748b]">anúncios ativos</span>
              </p>
              <p className="mt-2 text-sm text-[#64748b]">
                {data.stats.total_views.toLocaleString("pt-BR")} visitas registradas no painel
              </p>
            </div>
            <div className="rounded-xl bg-[#f8fafc] px-5 py-4 text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">
                Limite disponível
              </p>
              <p className="text-2xl font-extrabold text-[#0e62d8]">{data.stats.available_limit}</p>
            </div>
          </div>
        </section>
      )}

      {mode === "home" && variant === "lojista" && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">
              Anúncios ativos
            </p>
            <p className="mt-2 text-3xl font-extrabold text-[#0f172a]">{data.stats.active_ads}</p>
          </div>
          <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">
              Total de visitas
            </p>
            <p className="mt-2 text-3xl font-extrabold text-[#0f172a]">
              {data.stats.total_views.toLocaleString("pt-BR")}
            </p>
          </div>
          <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">
              Saldo / créditos
            </p>
            <p className="mt-2 text-lg font-extrabold text-[#64748b]">—</p>
            <p className="mt-1 text-xs text-[#94a3b8]">Integração financeira em evolução</p>
          </div>
        </section>
      )}

      {/* Lista */}
      <section id="meus-anuncios" className="space-y-4">
        {mode === "home" && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-extrabold text-[#0f172a]">Meus anúncios</h2>
            <div className="flex flex-wrap gap-2">
              {(["todos", "ativos", "pausados"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    tab === key
                      ? "bg-[#0e62d8] text-white"
                      : "bg-white text-[#64748b] ring-1 ring-[#e2e8f0] hover:bg-[#f8fafc]"
                  }`}
                >
                  {key === "todos" ? "Todos" : key === "ativos" ? "Ativos" : "Pausados"}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "ads" && (
          <div className="flex flex-wrap gap-2">
            {(["todos", "ativos", "pausados"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  tab === key
                    ? "bg-[#0e62d8] text-white"
                    : "bg-white text-[#64748b] ring-1 ring-[#e2e8f0] hover:bg-[#f8fafc]"
                }`}
              >
                {key === "todos" ? "Todos" : key === "ativos" ? "Ativos" : "Pausados"}
              </button>
            ))}
          </div>
        )}

        <AdsPremiumList
          ads={filteredAds}
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
