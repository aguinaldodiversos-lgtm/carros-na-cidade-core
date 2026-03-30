import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import { loadDashboardPayload, requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Painel",
  description: "Resumo da conta e seus anúncios.",
  alternates: { canonical: "/dashboard" },
};

export const dynamic = "force-dynamic";

function DashboardLoadError() {
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-3">
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Dashboard indisponível
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Não foi possível carregar seu painel agora
        </h1>
        <p className="text-sm leading-6 text-slate-600 sm:text-base">
          Sua sessão foi reconhecida, mas houve uma falha ao carregar os dados do dashboard. Tente
          atualizar a página em instantes.
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requirePfDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <DashboardLoadError />;
  }

  return <AccountDashboardView initialData={payload} variant="pf" mode="home" />;
}
