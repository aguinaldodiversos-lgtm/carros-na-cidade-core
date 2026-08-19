import type { Metadata } from "next";
import DealerSaleOpportunitiesList from "@/components/account/DealerSaleOpportunitiesList";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Veículos para avaliação",
  description: "Veículos enviados por proprietários particulares para avaliação de compra.",
  alternates: { canonical: "/dashboard-loja/oportunidades/veiculos" },
};

export const dynamic = "force-dynamic";

/**
 * Feed de veículos disponíveis para avaliação.
 *
 * Vive sob `/dashboard-loja/oportunidades` porque é ali que o hub da área do
 * lojista reserva o lugar desde a Fase 3 — o comentário daquela página já diz,
 * literalmente, que o hub existe "porque é onde a Fase 3 pendura 'Veículos para
 * comprar'". Criar um namespace paralelo (`/dashboard-loja/comprar-estoque`)
 * daria ao lojista dois lugares diferentes para procurar negócio fora do
 * estoque, e ao projeto duas árvores de navegação para manter.
 *
 * O item "Oportunidades" do menu já fica ativo aqui: `AccountPanelShell` casa
 * por `startsWith`, e esta rota é filha dele. Nenhuma alteração de navegação foi
 * necessária.
 *
 * `requireLojistaDashboardSession` redireciona não-CNPJ para /dashboard, mas
 * isso é NAVEGAÇÃO, não autorização: a API tem a própria guarda
 * (`requireDealerAccount`) e é ela que decide de fato.
 */
export default async function VeiculosParaAvaliacaoPage() {
  await requireLojistaDashboardSession();
  return <DealerSaleOpportunitiesList basePath="/dashboard-loja" />;
}
