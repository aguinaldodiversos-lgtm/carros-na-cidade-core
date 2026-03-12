import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { getDashboardPayload } from "@/services/dashboardService";
import { AUTH_COOKIE_NAME, getSessionUserFromCookieValue } from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Dashboard do anunciante",
  description: "Gerencie seus anuncios de carro, status e impulsionamento.",
  alternates: {
    canonical: "/dashboard",
  },
};

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const cookieStore = cookies();
  const session = getSessionUserFromCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/login");
  }
  if (session.type === "CNPJ") {
    redirect("/dashboard-loja");
  }

  const payload = getDashboardPayload(session.id, session.email);
  if (!payload) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <DashboardClient
        initialData={payload}
        heading="Dashboard Pessoa Fisica"
        subheading="Resumo de anuncios, limite de publicacao e impulsionamento."
        createLabel="Criar novo anuncio"
      />
    </main>
  );
}
