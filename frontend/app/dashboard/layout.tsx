import type { Metadata } from "next";
import AccountPanelShell from "@/components/account/AccountPanelShell";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Minha conta",
  description: "Painel do anunciante — Carros na Cidade.",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePfDashboardSession();

  return (
    <AccountPanelShell
      basePath="/dashboard"
      variant="pf"
      userName={session.name}
      accountLabel="CPF · Pessoa física"
    >
      {children}
    </AccountPanelShell>
  );
}
