import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Como funciona | Carros na Cidade",
  description:
    "Entenda como o Carros na Cidade conecta compradores e vendedores com foco regional, privacidade e transparência.",
};

export default function ComoFuncionaPage() {
  return (
    <StaticPageLayout
      eyebrow="Institucional"
      title="Como funciona"
      description="O Carros na Cidade reúne ofertas reais, busca por cidade e ferramentas para quem quer comprar ou anunciar veículos. Transparência: não somos banco nem loja — somos o ponto de encontro digital entre quem oferece e quem procura."
      sections={[
        {
          title: "Para quem compra",
          body: [
            "Você explora anúncios, usa filtros (cidade, marca, preço, etc.) e entra em contato pelo canal que o vendedor deixou no anúncio.",
            "A negociação e o pagamento do carro são entre você e o vendedor (ou loja). O portal ajuda na descoberta e no primeiro passo, não substitui vistoria nem decisão de compra.",
          ],
        },
        {
          title: "Para quem anuncia",
          body: [
            "Com conta e plano adequados, você publica veículos no painel, acompanha desempenho e atualiza dados quando precisar. Planos e benefícios estão descritos antes da contratação.",
            "Você é responsável pelo que publica: dados do carro, preço e imagens devem refletir a realidade, conforme os Termos de uso.",
          ],
        },
        {
          title: "Privacidade e segurança",
          body: [
            "Tratamos dados conforme a LGPD. A Política de Privacidade e a página LGPD explicam direitos e usos; em dúvidas, use o contato oficial.",
            "Para se proteger na compra ou venda, leia também a página de segurança na negociação — são dicas práticas, não substituto de cuidado de quem negocia.",
          ],
        },
      ]}
      afterSections={
        <p className="text-[15px] leading-7 text-[#5c6881]">
          <Link href="/ajuda" className="font-semibold text-[#0e62d8] hover:underline">
            Central de ajuda
          </Link>
          {" · "}
          <Link href="/seguranca" className="font-semibold text-[#0e62d8] hover:underline">
            Segurança na negociação
          </Link>
          {" · "}
          <Link
            href="/politica-de-privacidade"
            className="font-semibold text-[#0e62d8] hover:underline"
          >
            Privacidade
          </Link>
          {" · "}
          <Link href="/termos-de-uso" className="font-semibold text-[#0e62d8] hover:underline">
            Termos
          </Link>
          {" · "}
          <Link href="/contato" className="font-semibold text-[#0e62d8] hover:underline">
            Contato
          </Link>
        </p>
      }
    />
  );
}
