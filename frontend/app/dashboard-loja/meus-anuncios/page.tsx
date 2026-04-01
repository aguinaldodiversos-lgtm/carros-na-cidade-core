import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import { DashboardClientRecovery } from "@/components/dashboard/DashboardClientRecovery";
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

export default async function LojaMeusAnunciosPage() {
  const session = await requireLojistaDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <DashboardClientRecovery variant="lojista" mode="ads" />;
  }

  return <AccountDashboardView initialData={payload} variant="lojista" mode="ads" />;
}
