import type { Metadata } from "next";
import RegisterPageClient from "@/components/auth/RegisterPageClient";
import { sanitizeInternalRedirect } from "@/lib/auth/redirects";

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
  // /api/auth/register, que resolve o redirect pós-cadastro para ele. Validado
  // aqui pelo MESMO validador central (defesa em profundidade) — nunca passa
  // um destino cru adiante.
  const next = sanitizeInternalRedirect(searchParams?.next) ?? undefined;
  return <RegisterPageClient next={next} />;
}
