import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Regras de anúncio | Carros na Cidade",
  description: "Diretrizes para publicação de anúncios no Carros na Cidade. Conteúdos permitidos, proibidos e políticas de moderação.",
  alternates: { canonical: "/regras-de-anuncio" },
};

export default function RegrasDeAnuncioPage() {
  return (
    <StaticPageLayout
      eyebrow="Publicação"
      title="Regras de anúncio"
      description="Para manter a qualidade e a segurança do portal, todos os anúncios devem seguir estas diretrizes. Violações resultam em remoção do conteúdo ou bloqueio de conta."
      sections={[
        {
          title: "Conteúdo obrigatório",
          body: [
            "Informações corretas sobre marca, modelo, ano, versão, quilometragem, câmbio e combustível.",
            "Preço real e vigente — sem preços enganosos ou fora da realidade de mercado.",
            "Fotos do veículo real anunciado, com qualidade suficiente para visualizar o estado do bem.",
            "Dados de contato válidos e acessíveis ao comprador.",
          ],
        },
        {
          title: "Conteúdo proibido",
          body: [
            "Veículos com financiamento ativo sem indicação clara ou com restrição judicial.",
            "Fotos de outras publicações, imagens de stock ou que não representem o veículo real.",
            "Preços abaixo do custo de mercado com objetivo de obter dados de compradores (phishing).",
            "Informações falsas sobre quilometragem, sinistros ou revisões realizadas.",
            "Veículos com pendências de IPVA, licenciamento ou multas não declaradas.",
          ],
        },
        {
          title: "Moderação e remoção",
          body: [
            "Anúncios que violem as regras serão removidos sem aviso prévio. Contas reincidentes serão bloqueadas.",
            "Para denunciar um anúncio suspeito, utilize o botão 'Denunciar' na página do veículo.",
          ],
        },
        {
          title: "Responsabilidade",
          body: [
            "O anunciante é o único responsável pela veracidade das informações publicadas e pelas negociações realizadas.",
            "O Carros na Cidade não é parte nas transações de compra e venda e não responde por perdas decorrentes de negociações.",
          ],
        },
      ]}
    />
  );
}
