import { Suspense } from "react";
import type { Metadata } from "next";
import NewAdWizardClient from "@/components/painel/NewAdWizardClient";

export const metadata: Metadata = {
  title: "Novo anúncio",
  description:
    "Crie seu anúncio em etapas no Carros na Cidade — dados do veículo, fotos, opcionais e publicação.",
  alternates: { canonical: "/anunciar/novo" },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    tipo?: string;
  };
};

function WizardFallback() {
  return (
    <div className="min-h-[40vh] bg-cnc-bg px-4 py-16 text-center text-sm text-cnc-muted">
      Carregando fluxo de anúncio…
    </div>
  );
}

export default function AnunciarNovoPage({ searchParams }: PageProps) {
  const initialType = searchParams?.tipo === "lojista" ? "lojista" : "particular";

  return (
    <Suspense fallback={<WizardFallback />}>
      <NewAdWizardClient initialType={initialType} />
    </Suspense>
  );
}
