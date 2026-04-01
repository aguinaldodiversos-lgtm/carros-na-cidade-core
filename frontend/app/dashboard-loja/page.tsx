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
  title: "Dashboard da loja",
  description: "Painel CNPJ para gestao de anuncios, plano e performance.",
  alternates: {
    canonical: "/dashboard-loja",
  },
};

export const dynamic = "force-dynamic";

function DashboardLojaLoadError({ isAuthError }: { isAuthError?: boolean }) {
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
                href="/login?next=%2Fdashboard-loja"
                className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Fazer login novamente
              </Link>
            ) : (
              <>
                <Link
                  href="/dashboard-loja"
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

export default async function DashboardLojaPage() {
  const cookieStore = cookies();
  const session = getSessionDataFromCookieValue(
    cookieStore.get(AUTH_COOKIE_NAME)?.value
  );

  if (!session?.id) {
    redirect("/login?next=%2Fdashboard-loja");
  }

  if (session.type !== "CNPJ") {
    redirect("/dashboard");
  }

  if (!session.accessToken) {
    redirect("/login?next=%2Fdashboard-loja");
  }

  try {
    const payload = await fetchDashboard(session);

    if (!payload) {
      return <DashboardLojaLoadError />;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[DashboardLojaPage] fetchDashboard error:", message);

    // Token expirado e não foi possível renovar — força novo login
    const isAuthError =
      message.toLowerCase().includes("401") ||
      message.toLowerCase().includes("token") ||
      message.toLowerCase().includes("autenti") ||
      message.toLowerCase().includes("unauthorized");

    if (isAuthError) {
      redirect("/login?next=%2Fdashboard-loja&reason=session_expired");
    }

    return <DashboardLojaLoadError />;
  }
}
