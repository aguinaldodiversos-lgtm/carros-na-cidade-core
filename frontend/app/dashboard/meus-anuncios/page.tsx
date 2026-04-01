import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import { DashboardClientRecovery } from "@/components/dashboard/DashboardClientRecovery";
import { loadDashboardPayload, requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Meus anúncios",
  description: "Lista de anúncios publicados.",
  alternates: { canonical: "/dashboard/meus-anuncios" },
};

export const dynamic = "force-dynamic";

export default async function MeusAnunciosPage() {
  const session = await requirePfDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <DashboardClientRecovery variant="pf" mode="ads" />;
  }

  return <AccountDashboardView initialData={payload} variant="pf" mode="ads" />;
}
