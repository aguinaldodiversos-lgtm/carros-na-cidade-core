import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import {
  loadDashboardPayload,
  requirePfDashboardSession,
} from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Meus anúncios",
  description: "Lista de anúncios publicados.",
  alternates: { canonical: "/dashboard/meus-anuncios" },
};

export const dynamic = "force-dynamic";

function LoadError() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
      Não foi possível carregar os anúncios. Atualize a página ou tente novamente mais tarde.
    </div>
  );
}

export default async function MeusAnunciosPage() {
  const session = await requirePfDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <LoadError />;
  }

  return (
    <AccountDashboardView initialData={payload} variant="pf" mode="ads" />
  );
}
