import type { Metadata } from "next";
import AccountDashboardView from "@/components/account/AccountDashboardView";
import { DashboardLoadError } from "@/components/dashboard/DashboardLoadError";
import { loadDashboardPayload, requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Painel",
  description: "Resumo da conta e seus anúncios.",
  alternates: { canonical: "/dashboard" },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requirePfDashboardSession();
  const payload = await loadDashboardPayload(session);

  if (!payload) {
    return <DashboardLoadError />;
  }

  return <AccountDashboardView initialData={payload} variant="pf" mode="home" />;
}
