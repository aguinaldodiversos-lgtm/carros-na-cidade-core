import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Alertas de busca | Dashboard",
  alternates: { canonical: "/dashboard/alertas" },
};

export const dynamic = "force-dynamic";

export default async function DashboardAlertasPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard%2Falertas");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardNav />
      <div className="mt-6">
        <h1 className="text-[24px] font-extrabold text-[#1d2538]">Alertas de busca</h1>
        <p className="text-[14px] text-[#6b7488]">
          Receba notificações quando um veículo do seu perfil aparecer no portal.
        </p>

        <div className="mt-6 rounded-2xl border border-dashed border-[#d4daea] bg-white p-10 text-center">
          <div className="text-3xl">🔔</div>
          <p className="mt-3 text-[15px] font-bold text-[#1d2538]">Nenhum alerta configurado</p>
          <p className="mt-1 text-[13px] text-[#6b7488]">
            Configure alertas de busca para ser notificado quando um novo veículo do seu interesse aparecer.
          </p>
        </div>
      </div>
    </main>
  );
}
