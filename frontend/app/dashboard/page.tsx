import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard/DashboardClient";
import { fetchDashboard } from "@/lib/account/backend-account";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const metadata: Metadata = {
  title: "Dashboard do anunciante",
  description: "Gerencie seus anuncios de carro, status e impulsionamento.",
  alternates: {
    canonical: "/dashboard",
  },
};

export const dynamic = "force-dynamic";

function DashboardLoadError() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-3">
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Dashboard indisponível
          </span>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Não foi possível carregar seu painel agora
          </h1>

          <p className="text-sm leading-6 text-slate-600 sm:text-base">
            Sua sessão foi reconhecida, mas houve uma falha ao carregar os dados
            do dashboard. Tente atualizar a página em instantes.
          </p>
        </div>
      </div>
    </main>
  );
}

export default async function DashboardPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id) {
    redirect("/login?next=%2Fdashboard");
  }

  if (session.type === "CNPJ") {
    redirect("/dashboard-loja");
  }

  if (!session.accessToken) {
    redirect("/login?next=%2Fdashboard");
  }

  try {
    const payload = await fetchDashboard(session);

    if (!payload) {
      return <DashboardLoadError />;
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
  } catch (error) {
    console.error("DashboardPage fetchDashboard error:", error);
    return <DashboardLoadError />;
  }
}
