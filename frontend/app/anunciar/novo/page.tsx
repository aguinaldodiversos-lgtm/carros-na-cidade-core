import { Suspense } from "react";
import type { Metadata } from "next";
import NewAdWizardClient from "@/components/painel/NewAdWizardClient";

/**
 * `noindex, follow` (SEO 2026-06-27): este é o FLUXO técnico de criação de
 * anúncio (wizard "Veículo → fotos → publicação"), não uma página comercial
 * pública. O Google estava promovendo-o como sitelink "Veículo / Crie seu
 * anúncio em etapas…", competindo com páginas públicas (Comprar, FIPE,
 * Simulador). Tiramos da indexação (mantendo `follow` para preservar o
 * fluxo de crawl) — a página comercial indexável é `/anunciar`.
 */
export const metadata: Metadata = {
  title: "Novo anúncio",
  description:
    "Crie seu anúncio em etapas no Carros na Cidade — dados do veículo, fotos, opcionais e publicação.",
  alternates: { canonical: "/anunciar/novo" },
  robots: { index: false, follow: true },
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
