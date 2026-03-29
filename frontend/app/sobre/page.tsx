import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Sobre | Carros na Cidade",
  description:
    "Conheça o Carros na Cidade: portal automotivo regional para quem compra, vende e anuncia veículos com foco em cidade e transparência.",
};

export default function SobrePage() {
  return (
    <StaticPageLayout
      eyebrow="Institucional"
      title="Sobre o Carros na Cidade"
      description="Somos um portal automotivo pensado para o mercado brasileiro com foco regional: ajudamos pessoas e lojas a se encontrarem na hora de comprar, vender ou divulgar veículos, com busca clara e presença por cidade."
      sections={[
        {
          title: "O que nos define",
          body: [
            "Acreditamos que boa experiência em carros usados e seminovos passa por informação organizada, alcance local e contato direto entre interessados — sem promessas vazias de intermediário de venda.",
            "O Carros na Cidade reúne listagem, filtros e páginas territoriais para que você encontre ofertas e contexto da sua região, com a cara de um produto feito para durar.",
          ],
        },
        {
          title: "Para compradores",
          body: [
            "Você explora anúncios reais, compara preços e entra em contato com vendedores ou lojas pelo canal indicado no anúncio. Nosso papel é facilitar a descoberta e a primeira conversa; a negociação e o pagamento do veículo ficam entre as partes.",
          ],
        },
        {
          title: "Para quem anuncia",
          body: [
            "Lojistas e anunciantes usam o portal para ganhar visibilidade, leads e presença digital alinhada ao plano contratado. Oferecemos estrutura de anúncio, painel e regras transparentes — o que está no ar é o que foi publicado por você, com sua responsabilidade sobre dados e condições do veículo.",
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          Dúvidas sobre o funcionamento? Veja{" "}
          <Link href="/como-funciona" className="font-semibold text-[#0e62d8] hover:underline">
            Como funciona
          </Link>
          {" e a "}
          <Link href="/ajuda" className="font-semibold text-[#0e62d8] hover:underline">
            Central de ajuda
          </Link>
          .
        </p>
      }
    />
  );
}
