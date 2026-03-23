import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Favoritos | Dashboard",
  alternates: { canonical: "/dashboard/favoritos" },
};

export const dynamic = "force-dynamic";

export default async function DashboardFavoritosPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id || !session.accessToken) {
    redirect("/login?next=%2Fdashboard%2Ffavoritos");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <DashboardNav />
      <div className="mt-6">
        <h1 className="text-[24px] font-extrabold text-[#1d2538]">Favoritos</h1>
        <p className="text-[14px] text-[#6b7488]">Veículos que você salvou para ver mais tarde.</p>

        <div className="mt-6 rounded-2xl border border-dashed border-[#d4daea] bg-white p-10 text-center">
          <div className="text-3xl">❤️</div>
          <p className="mt-3 text-[15px] font-bold text-[#1d2538]">Nenhum favorito salvo ainda</p>
          <p className="mt-1 text-[13px] text-[#6b7488]">
            Salve veículos para acompanhar preços e disponibilidade.
          </p>
        </div>
      </div>
    </main>
  );
}
