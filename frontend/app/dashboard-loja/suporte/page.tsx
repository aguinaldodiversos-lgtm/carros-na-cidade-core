import type { Metadata } from "next";
import SupportCenter from "@/components/account/SupportCenter";

export const metadata: Metadata = {
  title: "Atendimento",
  description: "Abra e acompanhe chamados de suporte — Carros na Cidade.",
};

// Página fina: mesmo componente compartilhado do painel particular; aqui o
// basePath é o do painel do lojista.
export default function DashboardLojaSuportePage() {
  return <SupportCenter basePath="/dashboard-loja" />;
}
