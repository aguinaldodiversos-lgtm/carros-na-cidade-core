"use client";

import { useState } from "react";

import { adminApi, type AnalyticsOverview } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminKpiCard } from "@/components/admin/AdminKpiCard";
import { AdminChartCard } from "@/components/admin/AdminChartCard";

/**
 * Analytics interno (Fase 4.4) — dashboard admin.
 *
 * Cards (hoje/7d/30d + cliques comerciais) são janelas fixas; rankings e a
 * série usam o período selecionado (7d/30d/90d). Dados anônimos: nenhum dado
 * pessoal é coletado (ver migration 036 / analytics.constants).
 */

const PERIODS: Array<{ value: "7d" | "30d" | "90d"; label: string }> = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR");
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const overview = useAdminFetch<{ ok: boolean; data: AnalyticsOverview }>(
    () => adminApi.analytics.overview({ period }),
    [period]
  );

  if (overview.loading && !overview.data) {
    return <AdminLoadingState message="Carregando analytics…" />;
  }

  const data = overview.data?.data;
  const t = data?.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-cnc-text">Analytics</h1>
        <span className="text-[11px] text-cnc-muted-soft">
          First-party · anônimo (sem dados pessoais)
        </span>
        <div className="ml-auto flex gap-1 rounded-lg border border-cnc-line bg-white p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                period === p.value
                  ? "bg-primary text-white"
                  : "text-cnc-muted hover:bg-cnc-bg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {overview.error && <AdminErrorState message={overview.error} onRetry={() => overview.reload()} />}

      {/* Cards de topo (janelas fixas) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-3">
        <AdminKpiCard label="Visitantes hoje" value={fmt(t?.visitorsToday ?? 0)} />
        <AdminKpiCard label="Visualizações hoje" value={fmt(t?.viewsToday ?? 0)} color="#7c3aed" />
        <AdminKpiCard
          label="WhatsApp (30d)"
          value={fmt(t?.whatsappClicks30d ?? 0)}
          color="#1fae6a"
          subtitle="cliques comerciais"
        />
        <AdminKpiCard
          label="Visitantes 7d / 30d"
          value={`${fmt(t?.visitors7d ?? 0)} / ${fmt(t?.visitors30d ?? 0)}`}
        />
        <AdminKpiCard
          label="Visualizações 7d / 30d"
          value={`${fmt(t?.views7d ?? 0)} / ${fmt(t?.views30d ?? 0)}`}
          color="#7c3aed"
        />
        <AdminKpiCard
          label="Telefone / Simulação (30d)"
          value={`${fmt(t?.phoneClicks30d ?? 0)} / ${fmt(t?.financeClicks30d ?? 0)}`}
          color="#1fae6a"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminChartCard
          title={`Top cidades — visualizações (${period})`}
          bars={(data?.topCities ?? []).slice(0, 10).map((c) => ({
            label: `${c.city_name || c.city_slug}${c.state ? `/${c.state}` : ""}`,
            value: c.views,
            color: "#1a56db",
          }))}
        />
        <AdminChartCard
          title={`Top páginas — visualizações (${period})`}
          bars={(data?.topPages ?? []).slice(0, 10).map((p) => ({
            label: p.path,
            value: p.views,
            color: "#0ea5e9",
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminChartCard
          title={`Origens de tráfego (${period})`}
          bars={(data?.trafficSources?.referrers ?? []).slice(0, 10).map((r) => ({
            label: r.source,
            value: r.total,
            color: "#7c3aed",
          }))}
        />
        <AdminChartCard
          title={`Top regiões (${period})`}
          bars={(data?.topRegions ?? []).slice(0, 10).map((r) => ({
            label: r.region_slug,
            value: r.views,
            color: "#f59a1a",
          }))}
        />
      </div>

      {/* Tabelas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankCard title={`Anúncios mais vistos (${period})`}>
          <RankTable
            head={["Anúncio", "Views", "WhatsApp", "Telefone"]}
            rows={(data?.topAds ?? []).slice(0, 12).map((a) => [
              `#${a.ad_id}`,
              fmt(a.views),
              fmt(a.whatsapp_clicks),
              fmt(a.phone_clicks),
            ])}
            empty="Sem visualizações de anúncio no período."
          />
        </RankCard>

        <RankCard title={`Muitas visualizações, poucos contatos (${period})`}>
          <RankTable
            head={["Anúncio", "Views", "Contatos"]}
            rows={(data?.lowContactAds ?? []).slice(0, 12).map((a) => [
              `#${a.ad_id}`,
              fmt(a.views),
              fmt(a.contacts),
            ])}
            empty="Sem anúncios com volume suficiente ainda."
          />
        </RankCard>

        <RankCard title={`Posts do blog mais vistos (${period})`}>
          <RankTable
            head={["Post", "Views", "Sessões"]}
            rows={(data?.topBlogPosts ?? []).slice(0, 12).map((p) => [
              `#${p.blog_post_id}`,
              fmt(p.views),
              fmt(p.unique_sessions),
            ])}
            empty="Sem visualizações de post no período."
          />
        </RankCard>

        <RankCard title={`Campanhas (UTM) — ${period}`}>
          <RankTable
            head={["Source / Campaign", "Eventos"]}
            rows={(data?.trafficSources?.campaigns ?? []).slice(0, 12).map((c) => [
              `${c.utm_source || "?"}${c.utm_campaign ? ` · ${c.utm_campaign}` : ""}`,
              fmt(c.total),
            ])}
            empty="Nenhuma campanha UTM no período."
          />
        </RankCard>
      </div>

      <p className="text-[11px] leading-relaxed text-cnc-muted-soft">
        Analytics first-party e anônimo: não coletamos nome, CPF, telefone, e-mail nem localização
        precisa. session_id é um identificador aleatório; o User-Agent é armazenado apenas como hash.
        Retenção sugerida dos eventos brutos: 180–365 dias.
      </p>
    </div>
  );
}

function RankCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cnc-line bg-white shadow-card">
      <div className="px-5 pb-2 pt-4">
        <h2 className="text-sm font-bold text-cnc-text">{title}</h2>
      </div>
      <div className="px-2 pb-3">{children}</div>
    </div>
  );
}

function RankTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: Array<Array<string>>;
  empty: string;
}) {
  if (rows.length === 0) return <AdminEmptyState message={empty} />;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-cnc-muted-soft">
          {head.map((h, i) => (
            <th key={h} className={`px-3 py-1.5 font-semibold ${i === 0 ? "" : "text-right"}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, ri) => (
          <tr key={ri} className="border-t border-cnc-line/60">
            {cells.map((c, ci) => (
              <td
                key={ci}
                className={`px-3 py-1.5 ${ci === 0 ? "font-mono text-cnc-text" : "text-right font-semibold text-cnc-text"} ${ci === 0 ? "max-w-[220px] truncate" : ""}`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
