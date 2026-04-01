import type { Metadata } from "next";
import { StaticPageLayout } from "@/components/institutional/StaticPageLayout";

export const metadata: Metadata = {
  title: "Pagamentos e reembolsos | Carros na Cidade",
  description: "Política de pagamentos, renovações e reembolsos do Carros na Cidade.",
  alternates: { canonical: "/pagamentos-e-reembolsos" },
};

export default function PagamentosEReembolsosPage() {
  return (
    <StaticPageLayout
      eyebrow="Financeiro"
      title="Pagamentos e reembolsos"
      description="Informações sobre como funcionam os pagamentos, assinaturas e a política de reembolso do Carros na Cidade."
      sections={[
        {
          title: "Formas de pagamento",
          body: [
            "Aceitamos pagamentos via Mercado Pago: cartão de crédito, Pix, boleto bancário e carteiras digitais.",
            "Planos mensais são cobrados automaticamente via cartão de crédito cadastrado no Mercado Pago.",
          ],
        },
        {
          title: "Planos e renovação",
          body: [
            "Planos mensais (recorrentes) são renovados automaticamente na data de vencimento, salvo cancelamento anterior.",
            "Planos avulsos (ex.: destaque premium) têm pagamento único e validade definida no momento da compra.",
            "O cancelamento pode ser realizado a qualquer momento pelo dashboard. Os benefícios permanecem até o fim do período pago.",
          ],
        },
        {
          title: "Política de reembolso",
          body: [
            "Solicitações de reembolso podem ser feitas em até 7 dias após a cobrança, desde que os benefícios do plano não tenham sido utilizados.",
            "Planos avulsos de destaque ativados imediatamente não são elegíveis a reembolso após a ativação.",
            "Para solicitar reembolso, entre em contato pelo e-mail: financeiro@carrosnacidade.com",
          ],
        },
        {
          title: "Contestações",
          body: [
            "Em caso de cobrança indevida, entre em contato imediatamente pelo canal de suporte. Investigamos e respondemos em até 5 dias úteis.",
          ],
        },
      ]}
    />
  );
}
