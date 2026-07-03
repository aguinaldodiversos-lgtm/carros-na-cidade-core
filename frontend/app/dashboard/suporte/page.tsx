import type { Metadata } from "next";
import SupportCenter from "@/components/account/SupportCenter";

export const metadata: Metadata = {
  title: "Atendimento",
  description: "Abra e acompanhe chamados de suporte — Carros na Cidade.",
};

// Página fina: o componente SupportCenter é compartilhado com o painel do
// lojista; aqui só informamos o basePath do painel particular.
export default function DashboardSuportePage() {
  return <SupportCenter basePath="/dashboard" />;
}
