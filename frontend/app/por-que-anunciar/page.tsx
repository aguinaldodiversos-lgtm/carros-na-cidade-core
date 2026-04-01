import type { Metadata } from "next";
import Link from "next/link";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Por que anunciar | Carros na Cidade",
  description: "Razões para anunciar seu veículo no Carros na Cidade: alcance regional, segurança, sem comissão e contato direto com compradores.",
  alternates: { canonical: "/por-que-anunciar" },
};

export const revalidate = 3600;

export default function PorQueAnunciarPage() {
  return (
    <StaticPageLayout
      eyebrow="Benefícios"
      title="Por que anunciar no Carros na Cidade?"
      description="Anunciar no Carros na Cidade é gratuito, seguro e sem comissão. Seu veículo é exibido para compradores da sua cidade e região com verificação de documento."
      sections={[
        {
          title: "Sem comissão por venda",
          body: [
            "Diferente de outros portais, o Carros na Cidade não cobra porcentagem sobre a venda. O valor da negociação é 100% do vendedor.",
            "Planos pagos existem apenas para quem quiser mais destaque ou maior volume de anúncios ativos — nunca sobre o valor do veículo.",
          ],
        },
        {
          title: "Verificação de documento",
          body: [
            "Todo anunciante tem CPF ou CNPJ verificado no cadastro, o que aumenta a credibilidade e a segurança para compradores.",
            "Lojas com CNPJ verificado ganham badge de verificação e acesso ao perfil público de loja.",
          ],
        },
        {
          title: "Alcance local e regional",
          body: [
            "Anúncios aparecem nas páginas de cidade, marca, modelo e categoria — maximizando a exposição para compradores da sua região.",
            "SEO integrado coloca seu anúncio nos resultados do Google para buscas locais.",
          ],
        },
        {
          title: "Contato direto, sem intermediação",
          body: [
            "Compradores entram em contato pelo WhatsApp ou telefone diretamente com o vendedor. Não há mensagens filtradas ou intermediários.",
          ],
        },
        {
          title: "Dashboard completo",
          body: [
            "Acompanhe visualizações, leads e status de cada anúncio em tempo real pelo painel do anunciante.",
            "Pause, ative ou remova anúncios a qualquer momento sem burocracia.",
          ],
        },
      ]}
    />
  );
}
