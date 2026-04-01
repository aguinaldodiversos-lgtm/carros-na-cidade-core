import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardLojaNav } from "@/components/dashboard/DashboardLojaNav";
import { AUTH_COOKIE_NAME, getSessionDataFromCookieValue } from "@/services/sessionService";

export const metadata: Metadata = { title: "Pagamentos | Dashboard Loja" };
export const dynamic = "force-dynamic";

export default async function DashboardLojaPagamentosPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);
  if (!session?.id || !session.accessToken) redirect("/login?next=%2F/dashboard-loja%2Fpagamentos");
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardLojaNav />
      <div className="mt-6">
        <h1 className="text-[24px] font-extrabold text-[#1d2538]">Pagamentos</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-[#d4daea] bg-white p-10 text-center">
          <p className="text-[15px] font-bold text-[#1d2538]">Em breve</p>
          <p className="mt-1 text-[13px] text-[#6b7488]">Esta seção está sendo implementada.</p>
        </div>
      </div>
    </main>
  );
}
