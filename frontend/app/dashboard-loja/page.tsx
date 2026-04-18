import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import { DashboardClientRecovery } from "@/components/dashboard/DashboardClientRecovery";
import {
  loadDashboardPayload,
  requireLojistaDashboardSession,
} from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Painel da loja",
  description: "Gestão de anúncios e performance da loja.",
  alternates: { canonical: "/dashboard-loja" },
};

export const dynamic = "force-dynamic";

export default async function DashboardLojaPage() {
  const session = await requireLojistaDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <DashboardClientRecovery variant="lojista" mode="home" />;
  }

  return (
    <AccountDashboardView
      key={payload.user.id}
      initialData={payload}
      variant="lojista"
      mode="home"
    />
  );
}
