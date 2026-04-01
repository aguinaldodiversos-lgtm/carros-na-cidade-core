import type { Metadata } from "next";
import AccountPanelShell from "@/components/account/AccountPanelShell";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Minha conta",
  description: "Painel do anunciante — Carros na Cidade.",
};

function accountLabelFromSession(type: string) {
  if (type === "CNPJ") return "CNPJ · Lojista";
  if (type === "pending") return "Conta — complete ao criar o 1º anúncio";
  return "CPF · Pessoa física";
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePfDashboardSession();

  return (
    <AccountPanelShell
      basePath="/dashboard"
      variant="pf"
      userName={session.name}
      accountLabel={accountLabelFromSession(session.type)}
    >
      {children}
    </AccountPanelShell>
  );
}
