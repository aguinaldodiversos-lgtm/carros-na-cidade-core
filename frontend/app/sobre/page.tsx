import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Sobre | Carros na Cidade",
  description: "Conheça o portal Carros na Cidade e nossa proposta de valor para compradores, lojistas e anunciantes.",
};

export default function SobrePage() {
  return (
    <StaticPageLayout
      eyebrow="Institucional"
      title="Sobre o Carros na Cidade"
      description="O Carros na Cidade é um portal automotivo regional criado para conectar compradores, vendedores e lojistas com foco em descoberta local, transparência comercial e experiência premium."
      sections={[
        {
          title: "Nossa proposta",
          body: [
            "Unimos catálogo automotivo, descoberta por cidade e recursos de conversão para facilitar a jornada de quem busca ou anuncia veículos com mais confiança.",
            "A plataforma foi desenhada para crescer de forma escalável, com foco em SEO local, presença territorial e apresentação profissional dos anúncios.",
          ],
        },
        {
          title: "Para quem construímos",
          body: [
            "Atendemos compradores que desejam encontrar oportunidades perto de casa, além de lojistas e anunciantes que precisam de visibilidade, geração de contatos e ativação comercial.",
          ],
        },
      ]}
    />
  );
}
