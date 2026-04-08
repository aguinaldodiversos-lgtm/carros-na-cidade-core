"use client";

import { adminApi, type TopAdMetric, type CityMetric, type RecentEvent, type SeoCityMetric } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminChartCard } from "@/components/admin/AdminChartCard";

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

export default function AdminMetricas() {
  const topAds = useAdminFetch<{ ok: boolean; data: TopAdMetric[] }>(() => adminApi.metrics.topAds(15), []);
  const cities = useAdminFetch<{ ok: boolean; data: CityMetric[] }>(() => adminApi.metrics.cities(20), []);
  const events = useAdminFetch<{ ok: boolean; data: RecentEvent[] }>(() => adminApi.metrics.recentEvents(30), []);
  const seo = useAdminFetch<{ ok: boolean; data: SeoCityMetric[] }>(() => adminApi.metrics.seoCities(20), []);

  const anyLoading = topAds.loading && cities.loading && events.loading && seo.loading;
  const anyError = topAds.error || cities.error;

  if (anyLoading) return <AdminLoadingState message="Carregando métricas…" />;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold text-cnc-text">Métricas</h1>

      {anyError && <AdminErrorState message={anyError} onRetry={() => { topAds.reload(); cities.reload(); }} />}

      {/* Top Ads */}
      <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-bold text-cnc-text">Top Anúncios por Performance</h2>
        </div>
        {(topAds.data?.data?.length ?? 0) === 0 ? (
          <AdminEmptyState message="Sem métricas de anúncios disponíveis" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-t border-cnc-line">
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Título</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Cidade</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Views</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Clicks</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">CTR</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {(topAds.data?.data ?? []).map((ad) => (
                  <tr key={ad.id} className="border-t border-cnc-line/60 hover:bg-cnc-bg/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{ad.id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text max-w-[200px] truncate">{ad.title}</td>
                    <td className="px-4 py-2.5 text-cnc-muted">{ad.city}/{ad.state}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-cnc-text">{ad.views.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-cnc-text">{ad.clicks.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-primary">{ad.leads.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-cnc-text">{(ad.ctr * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5"><AdminStatusBadge status={ad.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts: Cities + SEO */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminChartCard
          title="Métricas por Cidade — Top Cidades"
          bars={(cities.data?.data ?? []).slice(0, 10).map((c) => ({
            label: `${c.name}/${c.state}`,
            value: c.ads_count,
            color: "#1a56db",
          }))}
        />

        <AdminChartCard
          title="SEO por Cidade"
          bars={(seo.data?.data ?? []).slice(0, 10).map((s) => ({
            label: s.city,
            value: s.impressions,
            color: "#7c3aed",
          }))}
        />
      </div>

      {/* City Details Table */}
      <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-bold text-cnc-text">Métricas por Cidade — Detalhadas</h2>
        </div>
        {(cities.data?.data?.length ?? 0) === 0 ? (
          <AdminEmptyState message="Sem métricas de cidades disponíveis" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-t border-cnc-line">
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Cidade</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Visitas</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Leads</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Anúncios</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider text-right">Demanda</th>
                </tr>
              </thead>
              <tbody>
                {(cities.data?.data ?? []).map((c) => (
                  <tr key={c.id} className="border-t border-cnc-line/60 hover:bg-cnc-bg/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-cnc-text">{c.name}/{c.state}</td>
                    <td className="px-4 py-2.5 text-right text-cnc-text">{c.visits.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-primary">{c.leads.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right text-cnc-text">{c.ads_count.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right">
                      <DemandBar score={c.demand_score} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Events */}
      <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-bold text-cnc-text">Eventos Recentes</h2>
        </div>
        {(events.data?.data?.length ?? 0) === 0 ? (
          <AdminEmptyState message="Nenhum evento recente" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-t border-cnc-line">
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Anúncio</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Cidade</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody>
                {(events.data?.data ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-cnc-line/60 hover:bg-cnc-bg/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{e.ad_id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text max-w-[200px] truncate">{e.ad_title || `Anúncio #${e.ad_id}`}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-cnc-bg px-2 py-0.5 text-[11px] font-semibold text-cnc-text">{e.event_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{e.ad_city || "—"}</td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">{fmtDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DemandBar({ score }: { score: number }) {
  const pct = Math.min(score * 100, 100);
  const color = pct > 70 ? "#0f9f6e" : pct > 40 ? "#d18a12" : "#d14343";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="h-2 w-16 rounded-full bg-cnc-bg overflow-hidden">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>{(score * 100).toFixed(0)}%</span>
    </div>
  );
}
