import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
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

function DashboardLoadError({ isAuthError }: { isAuthError?: boolean }) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-4">
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {isAuthError ? "Sessão expirada" : "Dashboard indisponível"}
          </span>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            {isAuthError
              ? "Sua sessão expirou"
              : "Não foi possível carregar seu painel agora"}
          </h1>

          <p className="text-sm leading-6 text-slate-600 sm:text-base">
            {isAuthError
              ? "Por segurança, sua sessão não pôde ser renovada automaticamente. Faça login novamente para continuar."
              : "Houve uma falha temporária ao carregar os dados do dashboard. Tente atualizar a página em instantes."}
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            {isAuthError ? (
              <Link
                href="/login?next=%2Fdashboard"
                className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Fazer login novamente
              </Link>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Tentar novamente
                </Link>
                <Link
                  href="/contato"
                  className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Falar com suporte
                </Link>
              </>
            )}
          </div>
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[DashboardPage] fetchDashboard error:", message);

    // Token expirado e não foi possível renovar — força novo login
    const isAuthError =
      message.toLowerCase().includes("401") ||
      message.toLowerCase().includes("token") ||
      message.toLowerCase().includes("autenti") ||
      message.toLowerCase().includes("unauthorized");

    if (isAuthError) {
      // Redireciona para login com next param para voltar ao dashboard
      redirect("/login?next=%2Fdashboard&reason=session_expired");
    }

    return <DashboardLoadError />;
  }
}
