import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getDashboardPayload } from "@/services/dashboardService";
import { AUTH_COOKIE_NAME, getSessionUserFromCookieValue } from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Dashboard da loja",
  description: "Painel CNPJ para gestao de anuncios, plano e performance.",
  alternates: {
    canonical: "/dashboard-loja",
  },
};

export const dynamic = "force-dynamic";

export default function DashboardLojaPage() {
  const cookieStore = cookies();
  const session = getSessionUserFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/login");
  }
  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }

  const payload = getDashboardPayload(session.id, session.email);
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
