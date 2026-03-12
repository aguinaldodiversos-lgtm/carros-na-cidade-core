import type { Metadata } from "next";
import RegionalEntryHub from "@/components/common/RegionalEntryHub";

export const metadata: Metadata = {
  title: "Tabela FIPE por cidade",
  description:
    "Acesse consultas FIPE locais e compare o valor de referência com o inventário da sua região.",
  alternates: {
    canonical: "/tabela-fipe",
  },
};

export default function TabelaFipeEntryPage() {
  return (
    <RegionalEntryHub
      eyebrow="Decisão de compra"
      title="Tabela FIPE por cidade"
      description="Entre por uma cidade prioritária para consultar valor de referência, comparar com anúncios reais e identificar oportunidades abaixo da FIPE com contexto local."
      basePath="/tabela-fipe"
      primaryCta={{ label: "Ver anúncios abaixo da FIPE", href: "/anuncios?below_fipe=true" }}
      secondaryCta={{ label: "Abrir catálogo nacional", href: "/anuncios" }}
      highlights={[
        "Consulta local ligada ao inventário disponível no portal.",
        "Leitura de valor de referência com intenção comercial real.",
        "Ponto de entrada para oportunidades e análise regional.",
      ]}
    />
  );
}
