"use client";

import { useRouter } from "next/navigation";
import { AdminKpiCard } from "@/components/admin/AdminKpiCard";
import { AdminChartCard, AdminMiniBarChart } from "@/components/admin/AdminChartCard";
import { AdminTableCard } from "@/components/admin/AdminTableCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { adminApi, type DashboardOverview, type DashboardKpis } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";

function fmt(n: number | undefined | null) {
  if (n == null) return "0";
  return n.toLocaleString("pt-BR");
}

function money(n: number | undefined | null) {
  if (n == null) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

export default function AdminDashboard() {
  const router = useRouter();

  const overview = useAdminFetch<{ ok: boolean; data: DashboardOverview }>(
    () => adminApi.dashboard.overview(),
    []
  );
  const kpis = useAdminFetch<{ ok: boolean; data: DashboardKpis }>(
    () => adminApi.dashboard.kpis(30),
    []
  );
  const adsRes = useAdminFetch(
    () => adminApi.ads.list({ limit: 5, sort: "created_at", order: "desc" }),
    []
  );
  const advsRes = useAdminFetch(
    () => adminApi.advertisers.list({ limit: 5, sort: "created_at", order: "desc" }),
    []
  );
  const paysRes = useAdminFetch(() => adminApi.payments.list({ limit: 5 }), []);

  const isLoading = overview.loading || kpis.loading;
  const hasError = overview.error || kpis.error;

  if (isLoading) return <AdminLoadingState message="Carregando dashboard…" />;
  if (hasError) {
    return (
      <AdminErrorState
        message={overview.error || kpis.error || "Erro"}
        onRetry={() => {
          overview.reload();
          kpis.reload();
        }}
      />
    );
  }

  const ov = overview.data?.data;
  const kp = kpis.data?.data;
  const topCities = kp?.top_cities ?? [];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminKpiCard
          label="Anúncios Ativos"
          value={fmt(ov?.ads?.active)}
          subtitle={`${fmt(ov?.ads?.total)} total`}
          color="#1a56db"
        />
        <AdminKpiCard
          label="Anunciantes Ativos"
          value={fmt(ov?.advertisers?.active)}
          subtitle={`${fmt(ov?.advertisers?.total)} total`}
          color="#0f9f6e"
        />
        <AdminKpiCard
          label="Custo da Campanha"
          value={money(kp?.revenue?.boost_revenue)}
          subtitle={`${fmt(kp?.new_ads)} novos anúncios (30d)`}
          color="#d18a12"
        />
        <AdminKpiCard
          label="Faturamento Total"
          value={money(kp?.revenue?.total_approved)}
          subtitle={`Planos: ${money(kp?.revenue?.plan_revenue)}`}
          color="#7c3aed"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminMiniBarChart
          title="Visitas & Leads — Top Cidades"
          items={topCities.slice(0, 6).map((c) => ({
            label: `${c.name}/${c.state}`,
            values: [{ name: "Anúncios", value: c.ads_count, color: "#1a56db" }],
          }))}
        />
        <AdminChartCard
          title="Desempenho — Resumo Geral"
          bars={[
            { label: "Anúncios Ativos", value: ov?.ads?.active ?? 0, color: "#1a56db" },
            { label: "Destacados", value: ov?.ads?.highlighted ?? 0, color: "#7c3aed" },
            { label: "Pausados", value: ov?.ads?.paused ?? 0, color: "#d18a12" },
            { label: "Bloqueados", value: ov?.ads?.blocked ?? 0, color: "#d14343" },
            { label: "Usuários", value: ov?.users?.total ?? 0, color: "#0f9f6e" },
            { label: "Cidades", value: ov?.cities?.total ?? 0, color: "#6366f1" },
          ]}
        />
      </div>

      {/* Bottom Tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminTableCard
          title="Anúncios Recentes"
          onViewAll={() => router.push("/admin/anuncios")}
          columns={[
            {
              key: "title",
              label: "Título",
              render: (r) => (
                <span className="font-medium truncate max-w-[180px] block">{String(r.title)}</span>
              ),
            },
            {
              key: "city",
              label: "Cidade",
              render: (r) => (
                <span>
                  {String(r.city)}/{String(r.state)}
                </span>
              ),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <AdminStatusBadge status={String(r.status)} />,
            },
            {
              key: "created_at",
              label: "Data",
              render: (r) => <span>{shortDate(String(r.created_at))}</span>,
            },
          ]}
          rows={(adsRes.data?.data ?? []) as Record<string, unknown>[]}
        />

        <AdminTableCard
          title="Anunciantes"
          onViewAll={() => router.push("/admin/anunciantes")}
          columns={[
            {
              key: "name",
              label: "Nome",
              render: (r) => <span className="font-medium">{String(r.name)}</span>,
            },
            { key: "email", label: "Email" },
            {
              key: "status",
              label: "Status",
              render: (r) => <AdminStatusBadge status={String(r.status)} />,
            },
          ]}
          rows={(advsRes.data?.data ?? []) as Record<string, unknown>[]}
        />

        <AdminTableCard
          title="Pagamentos Recentes"
          onViewAll={() => router.push("/admin/pagamentos")}
          columns={[
            {
              key: "user_name",
              label: "Usuário",
              render: (r) => (
                <span className="font-medium">{String(r.user_name || r.user_email || "—")}</span>
              ),
            },
            {
              key: "amount",
              label: "Valor",
              render: (r) => <span className="font-semibold">{money(Number(r.amount))}</span>,
            },
            {
              key: "context",
              label: "Contexto",
              render: (r) => <span className="capitalize">{String(r.context)}</span>,
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <AdminStatusBadge status={String(r.status)} />,
            },
          ]}
          rows={(paysRes.data?.data ?? []) as Record<string, unknown>[]}
        />

        <AdminTableCard
          title="Top Cidades"
          columns={[
            {
              key: "name",
              label: "Cidade",
              render: (r) => (
                <span className="font-medium">
                  {String(r.name)}/{String(r.state)}
                </span>
              ),
            },
            {
              key: "ads_count",
              label: "Anúncios",
              render: (r) => <span className="font-semibold">{fmt(Number(r.ads_count))}</span>,
            },
          ]}
          rows={(topCities as unknown as Record<string, unknown>[]) ?? []}
        />
      </div>
    </div>
  );
}
