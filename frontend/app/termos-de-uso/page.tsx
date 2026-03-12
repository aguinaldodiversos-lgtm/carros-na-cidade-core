import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Termos de Uso | Carros na Cidade",
  description: "Condições gerais de uso do portal Carros na Cidade.",
};

export default function TermosDeUsoPage() {
  return (
    <StaticPageLayout
      eyebrow="Uso da plataforma"
      title="Termos de Uso"
      description="Ao navegar ou utilizar o Carros na Cidade, o usuário concorda com as condições de uso da plataforma, com respeito às regras de cadastro, publicação e interação comercial."
      sections={[
        {
          title: "Publicação e responsabilidade",
          body: [
            "Cada anunciante é responsável pela veracidade das informações, imagens, preços e condições divulgadas em seus anúncios.",
            "O portal pode moderar, ajustar ou remover conteúdos que violem políticas internas, legislação aplicável ou comprometam a experiência dos usuários.",
          ],
        },
        {
          title: "Uso permitido",
          body: [
            "A utilização da plataforma deve respeitar finalidades legítimas de compra, venda, comparação, divulgação e atendimento comercial.",
            "Não é permitido utilizar o sistema para fraudes, spam, coleta indevida de dados ou práticas que prejudiquem a estabilidade da operação.",
          ],
        },
      ]}
    />
  );
}
