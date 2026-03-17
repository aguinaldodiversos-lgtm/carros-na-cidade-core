import type { Metadata } from "next";
import RegisterPageClient from "@/components/auth/RegisterPageClient";

export const metadata: Metadata = {
  title: "Criar conta",
  description:
    "Crie sua conta no Carros na Cidade para anunciar veículos com mais segurança e validação de CPF ou CNPJ.",
  alternates: {
    canonical: "/cadastro",
  },
  openGraph: {
    title: "Criar conta | Carros na Cidade",
    description:
      "Cadastre-se no Carros na Cidade e anuncie veículos com segurança e validação de documento.",
    url: "/cadastro",
    type: "website",
    locale: "pt_BR",
  },
};

export default function CadastroPage() {
  return <RegisterPageClient />;
}
