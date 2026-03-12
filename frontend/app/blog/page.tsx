import type { Metadata } from "next";
import RegionalEntryHub from "@/components/common/RegionalEntryHub";

export const metadata: Metadata = {
  title: "Blog automotivo regional",
  description:
    "Explore notícias, tendências e conteúdo automotivo ligado às cidades prioritárias do portal.",
  alternates: {
    canonical: "/blog",
  },
};

export default function BlogEntryPage() {
  return (
    <RegionalEntryHub
      eyebrow="Conteúdo local"
      title="Blog automotivo regional"
      description="Escolha uma cidade para acessar notícias, sinais de mercado, conteúdo editorial local e entradas conectadas ao inventário do portal."
      basePath="/blog"
      primaryCta={{ label: "Ver catálogo nacional", href: "/anuncios" }}
      secondaryCta={{ label: "Abrir planos do portal", href: "/planos" }}
      highlights={[
        "Conteúdo local conectado a busca, FIPE e financiamento.",
        "Entradas úteis para descoberta orgânica por cidade.",
        "Jornada editorial pensada para levar ao inventário real.",
      ]}
    />
  );
}
