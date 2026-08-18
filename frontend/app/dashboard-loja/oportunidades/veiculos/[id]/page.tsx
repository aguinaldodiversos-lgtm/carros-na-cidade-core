import type { Metadata } from "next";
import DealerSaleOpportunityDetail from "@/components/account/DealerSaleOpportunityDetail";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Avaliação de veículo",
  description: "Analise as informações declaradas e envie sua proposta preliminar.",
  // `robots` não é declarado aqui porque a área inteira já está fora do índice:
  // /dashboard-loja é autenticada e nenhuma rota dela entra em sitemap, canonical
  // ou JSON-LD. Não existe superfície pública para esta solicitação — ela não tem
  // slug, e nenhuma query pública conhece a tabela.
};

export const dynamic = "force-dynamic";

/**
 * Detalhe de um veículo disponível para avaliação.
 *
 * `requireLojistaDashboardSession` redireciona não-CNPJ para /dashboard, mas isso
 * é NAVEGAÇÃO, não autorização: a API tem a própria guarda
 * (`requireDealerAccount` + cidade da loja) e é ela que decide de fato. Um
 * lojista de outra cidade que abrir esta URL recebe 404 da API e vê o estado de
 * erro — nunca a ficha.
 */
export default async function AvaliacaoVeiculoPage({ params }: { params: { id: string } }) {
  await requireLojistaDashboardSession();
  return <DealerSaleOpportunityDetail id={params.id} basePath="/dashboard-loja" />;
}
