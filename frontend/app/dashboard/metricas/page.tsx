import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { fetchDashboard } from "@/lib/account/backend-account";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Métricas | Dashboard",
  alternates: { canonical: "/dashboard/metricas" },
};

export const dynamic = "force-dynamic";

export default async function DashboardMetricasPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard%2Fmetricas");
  }

  let stats: {
    active_ads: number;
    paused_ads: number;
    total_views: number;
    featured_ads: number;
  } | null = null;

  try {
    const payload = await fetchDashboard(session);
    stats = {
      active_ads: payload.stats.active_ads,
      paused_ads: payload.stats.paused_ads,
      total_views: payload.stats.total_views,
      featured_ads: payload.stats.featured_ads,
    };
  } catch {
    // Unavailable
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardNav />
      <div className="mt-6">
        <h1 className="text-[24px] font-extrabold text-[#1d2538]">Métricas</h1>
        <p className="text-[14px] text-[#6b7488]">Resumo de performance dos seus anúncios.</p>

        {stats ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Anúncios ativos", value: stats.active_ads, icon: "✅" },
              { label: "Anúncios pausados", value: stats.paused_ads, icon: "⏸️" },
              { label: "Total de visualizações", value: stats.total_views, icon: "👁️" },
              { label: "Com destaque", value: stats.featured_ads, icon: "⭐" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
                <div className="text-2xl">{item.icon}</div>
                <p className="mt-2 text-[28px] font-extrabold text-[#1d2538]">{item.value}</p>
                <p className="text-[13px] text-[#6b7488]">{item.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-[#d4daea] bg-white p-10 text-center">
            <div className="text-3xl">📈</div>
            <p className="mt-3 text-[15px] font-bold text-[#1d2538]">Nenhuma métrica disponível</p>
            <p className="mt-1 text-[13px] text-[#6b7488]">
              Publique anúncios para começar a ver métricas de visualização.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
