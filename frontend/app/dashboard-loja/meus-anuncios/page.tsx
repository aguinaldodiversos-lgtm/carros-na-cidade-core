import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import {
  loadDashboardPayload,
  requireLojistaDashboardSession,
} from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Meus anúncios",
  description: "Anúncios da loja.",
  alternates: { canonical: "/dashboard-loja/meus-anuncios" },
};

export const dynamic = "force-dynamic";

function LoadError() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
      Não foi possível carregar os anúncios. Atualize a página ou tente novamente mais tarde.
    </div>
  );
}

export default async function LojaMeusAnunciosPage() {
  const session = await requireLojistaDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <LoadError />;
  }

  return (
    <AccountDashboardView initialData={payload} variant="lojista" mode="ads" />
  );
}
