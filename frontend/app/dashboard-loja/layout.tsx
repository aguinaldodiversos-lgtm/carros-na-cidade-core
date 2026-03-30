import type { Metadata } from "next";
import AccountPanelShell from "@/components/account/AccountPanelShell";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Painel da loja",
  description: "Painel do lojista — Carros na Cidade.",
};

export default async function DashboardLojaLayout({ children }: { children: React.ReactNode }) {
  const session = await requireLojistaDashboardSession();

  return (
    <AccountPanelShell
      basePath="/dashboard-loja"
      variant="lojista"
      userName={session.name}
      accountLabel="CNPJ · Lojista"
    >
      {children}
    </AccountPanelShell>
  );
}
