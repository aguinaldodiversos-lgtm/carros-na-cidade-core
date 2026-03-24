import { Suspense } from "react";
import NewAdWizardClient from "@/components/painel/NewAdWizardClient";

type PageProps = {
  searchParams?: {
    tipo?: string;
  };
};

function WizardFallback() {
  return (
    <div className="min-h-[50vh] bg-[#F5F7FB] px-4 py-16 text-center text-sm text-[#6E748A]">
      Carregando fluxo de anúncio…
    </div>
  );
}

export default function NovoAnuncioPage({ searchParams }: PageProps) {
  const initialType = searchParams?.tipo === "lojista" ? "lojista" : "particular";

  return (
    <Suspense fallback={<WizardFallback />}>
      <NewAdWizardClient initialType={initialType} />
    </Suspense>
  );
}
