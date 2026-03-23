import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { fetchDashboard } from "@/lib/account/backend-account";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Assinatura | Dashboard",
  alternates: { canonical: "/dashboard/assinatura" },
};

export const dynamic = "force-dynamic";

export default async function DashboardAssinaturaPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard%2Fassinatura");
  }

  let currentPlan: { name: string; billing_model: string; ad_limit: number } | null = null;
  try {
    const payload = await fetchDashboard(session);
    currentPlan = payload.current_plan;
  } catch {
    // Unavailable
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardNav />
      <div className="mt-6">
        <h1 className="text-[24px] font-extrabold text-[#1d2538]">Assinatura</h1>
        <p className="text-[14px] text-[#6b7488]">Plano atual e opções de upgrade.</p>

        <div className="mt-6 rounded-2xl border border-[#dfe4ef] bg-white p-6 shadow-sm">
          <h2 className="text-[16px] font-extrabold text-[#1d2538]">Plano atual</h2>
          {currentPlan ? (
            <div className="mt-3">
              <p className="text-[15px] font-bold text-[#0e62d8]">{currentPlan.name}</p>
              <p className="text-[13px] text-[#6b7488]">
                Até {currentPlan.ad_limit} anúncios ·{" "}
                {currentPlan.billing_model === "free" ? "Gratuito" : currentPlan.billing_model === "monthly" ? "Mensal" : "Avulso"}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[14px] text-[#6b7488]">Plano gratuito (até 3 anúncios ativos)</p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/planos"
              className="rounded-xl bg-[#0e62d8] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#0b54be]"
            >
              Ver planos disponíveis
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
