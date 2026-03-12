import type { Metadata } from "next";
import RegionalEntryHub from "@/components/common/RegionalEntryHub";

export const metadata: Metadata = {
  title: "Simulador de financiamento por cidade",
  description:
    "Escolha uma cidade para simular parcela, entrada e custo financeiro com contexto regional.",
  alternates: {
    canonical: "/simulador-financiamento",
  },
};

export default function SimuladorFinanciamentoEntryPage() {
  return (
    <RegionalEntryHub
      eyebrow="Financiamento local"
      title="Simulador de financiamento por cidade"
      description="Comece por uma cidade estratégica para simular financiamento, comparar parcelas e seguir para o inventário com maior intenção de compra."
      basePath="/simulador-financiamento"
      primaryCta={{ label: "Simular e ver anúncios", href: "/anuncios" }}
      secondaryCta={{ label: "Explorar Tabela FIPE", href: "/tabela-fipe" }}
      highlights={[
        "Simulação conectada ao catálogo e à jornada local.",
        "Entrada útil para intenção de financiamento e decisão.",
        "Menos dependência de uma cidade editorial padrão.",
      ]}
    />
  );
}
