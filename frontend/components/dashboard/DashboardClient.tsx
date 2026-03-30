"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AdCard from "@/components/dashboard/AdCard";
import BoostModal from "@/components/dashboard/BoostModal";
import DashboardStats from "@/components/dashboard/DashboardStats";
import type { DashboardAd, DashboardPayload } from "@/lib/dashboard-types";

type DashboardClientProps = {
  initialData: DashboardPayload;
  heading: string;
  subheading: string;
  createLabel: string;
};

export default function DashboardClient({
  initialData,
  heading,
  subheading,
  createLabel,
}: DashboardClientProps) {
  const [data, setData] = useState(initialData);
  const [busyAdId, setBusyAdId] = useState<string | null>(null);
  const [boostPreviewAd, setBoostPreviewAd] = useState<DashboardAd | null>(null);

  const allAds = useMemo(
    () => [...data.active_ads, ...data.paused_ads],
    [data.active_ads, data.paused_ads]
  );
  const defaultBoostAd = allAds[0] ?? null;

  const refreshDashboard = async () => {
    const response = await fetch("/api/dashboard/me", { method: "GET", cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as DashboardPayload;
    setData(payload);
  };

  const updateStatus = async (ad: DashboardAd) => {
    if (busyAdId) return;
    setBusyAdId(ad.id);
    try {
      await fetch(`/api/ads/${ad.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: ad.status === "active" ? "pause" : "activate",
        }),
      });
      await refreshDashboard();
    } finally {
      setBusyAdId(null);
    }
  };

  const removeAd = async (ad: DashboardAd) => {
    if (busyAdId) return;
    setBusyAdId(ad.id);
    try {
      await fetch(`/api/ads/${ad.id}`, {
        method: "DELETE",
      });
      await refreshDashboard();
    } finally {
      setBusyAdId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-[0_3px_18px_rgba(10,20,40,0.06)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#5d6983]">
              Painel do anunciante
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-[#1d2538] sm:text-3xl">{heading}</h1>
            <p className="mt-1 text-sm text-[#5b6680]">{subheading}</p>
          </div>

          <div className="grid gap-2 sm:w-auto">
            <Link
              href="/anunciar"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white transition hover:brightness-110"
            >
              {createLabel}
            </Link>
            {defaultBoostAd && (
              <button
                type="button"
                onClick={() => setBoostPreviewAd(defaultBoostAd)}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#d7deeb] px-4 text-sm font-bold text-[#37425f] transition hover:bg-[#f2f6fd]"
              >
                Ver opcoes de impulsao
              </button>
            )}
          </div>
        </div>
      </section>

      {data.user.type === "CNPJ" && (
        <section className="rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-[0_3px_18px_rgba(10,20,40,0.06)] sm:p-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#eef4ff] text-xl font-extrabold text-[#0e62d8]">
              {data.user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-[#5d6983]">
                Logo da loja
              </p>
              <p className="text-base font-extrabold text-[#1d2538]">{data.user.name}</p>
              <p className="text-sm text-[#5d6982]">
                {data.stats.is_verified_store ? "CNPJ verificado" : "CNPJ pendente de verificacao"}
              </p>
            </div>
          </div>
        </section>
      )}

      <DashboardStats stats={data.stats} accountType={data.user.type} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-[#1d2538]">Anuncios ativos</h2>
          <p className="text-sm text-[#5f6982]">{data.active_ads.length} ativos</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.active_ads.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              onToggleStatus={updateStatus}
              onDelete={removeAd}
              busy={busyAdId === ad.id}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-[#1d2538]">Anuncios pausados</h2>
          <p className="text-sm text-[#5f6982]">{data.paused_ads.length} pausados</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.paused_ads.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              onToggleStatus={updateStatus}
              onDelete={removeAd}
              busy={busyAdId === ad.id}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-[0_3px_18px_rgba(10,20,40,0.06)] sm:p-6">
        <h2 className="text-xl font-extrabold text-[#1d2538]">Mapa de conexao</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#34405b]">
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Login</span>
          <span>{"->"}</span>
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Dashboard</span>
          <span>{"->"}</span>
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Card do anuncio</span>
          <span>{"->"}</span>
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Impulsionar</span>
          <span>{"->"}</span>
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Mercado Pago</span>
          <span>{"->"}</span>
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Webhook</span>
          <span>{"->"}</span>
          <span className="rounded-lg bg-[#edf3ff] px-3 py-1.5">Destaque + IA</span>
        </div>
      </section>

      <BoostModal
        open={Boolean(boostPreviewAd)}
        ad={boostPreviewAd}
        options={data.boost_options}
        onClose={() => setBoostPreviewAd(null)}
      />
    </div>
  );
}
