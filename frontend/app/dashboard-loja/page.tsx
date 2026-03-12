import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { fetchDashboard } from "@/lib/account/backend-account";
import { AUTH_COOKIE_NAME, getSessionDataFromCookieValue } from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Dashboard da loja",
  description: "Painel CNPJ para gestao de anuncios, plano e performance.",
  alternates: {
    canonical: "/dashboard-loja",
  },
};

export const dynamic = "force-dynamic";

export default async function DashboardLojaPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/login");
  }
  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }

  if (!session.accessToken) {
    redirect("/login");
  }

  let payload: Awaited<ReturnType<typeof fetchDashboard>> | null = null;
  try {
    payload = await fetchDashboard(session);
  } catch {
    redirect("/login");
  }
  if (!payload) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <DashboardClient
        initialData={payload}
        heading="Dashboard Lojista (CNPJ)"
        subheading="Gestao de anuncios da loja, limite, plano e impulsionamento."
        createLabel="Criar anuncio"
      />
    </main>
  );
}
