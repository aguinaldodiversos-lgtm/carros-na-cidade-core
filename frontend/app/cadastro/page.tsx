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

type CadastroPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default function CadastroPage({ searchParams }: CadastroPageProps) {
  // `next` propagado do login/CTA; o RegisterPageClient o reenvia ao
  // /api/auth/register, que já resolve o redirect pós-cadastro para ele
  // (formulário de anúncio, no fluxo do anunciante novo).
  const next = typeof searchParams?.next === "string" ? searchParams.next : undefined;
  return <RegisterPageClient next={next} />;
}
