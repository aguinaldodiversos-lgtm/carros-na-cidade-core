import type { Metadata } from "next";
import SellPublishFlowClient from "@/components/sell/SellPublishFlowClient";

/**
 * `noindex, follow` (SEO 2026-06-27): fluxo técnico de publicação de anúncio
 * (seleção de tipo → wizard), não página comercial pública. A landing
 * indexável de conversão é `/anunciar`. Mantemos `follow` para o crawl.
 */
export const metadata: Metadata = {
  title: "Publicar anúncio",
  alternates: { canonical: "/anunciar/publicar" },
  robots: { index: false, follow: true },
};

type PageProps = {
  searchParams?: {
    tipo?: string;
  };
};

export default function SellPublishPage({ searchParams }: PageProps) {
  const tipo =
    searchParams?.tipo === "lojista" || searchParams?.tipo === "particular"
      ? searchParams.tipo
      : "particular";

  return <SellPublishFlowClient initialType={tipo} />;
}
