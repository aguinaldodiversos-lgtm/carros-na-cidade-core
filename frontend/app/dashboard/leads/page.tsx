import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Leads recebidos | Dashboard",
  alternates: { canonical: "/dashboard/leads" },
};

export const dynamic = "force-dynamic";

export default async function DashboardLeadsPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard%2Fleads");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardNav />
      <div className="mt-6">
        <h1 className="text-[24px] font-extrabold text-[#1d2538]">Leads recebidos</h1>
        <p className="text-[14px] text-[#6b7488]">Contatos de compradores interessados nos seus anúncios.</p>

        <div className="mt-6 rounded-2xl border border-dashed border-[#d4daea] bg-white p-10 text-center">
          <div className="text-3xl">💬</div>
          <p className="mt-3 text-[15px] font-bold text-[#1d2538]">Nenhum lead registrado ainda</p>
          <p className="mt-1 text-[13px] text-[#6b7488]">
            Quando compradores entrarem em contato pelos seus anúncios, aparecerão aqui.
          </p>
        </div>
      </div>
    </main>
  );
}
