import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DealerOpportunityDetail from "@/components/account/DealerOpportunityDetail";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Oportunidade",
  description: "Detalhe da procura de um comprador da sua cidade.",
};

export const dynamic = "force-dynamic";

/**
 * Destino dos `action_path` das notificações
 * (`/dashboard-loja/oportunidades/compradores/{id}`). O isolamento por cidade
 * é do backend: um id de outra cidade responde 404 e a tela cai no estado de
 * erro, sem revelar que a procura existe.
 */
export default async function OportunidadeDetalhePage({ params }: { params: { id: string } }) {
  await requireLojistaDashboardSession();

  const id = /^\d+$/.test(params.id) ? Number.parseInt(params.id, 10) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  return <DealerOpportunityDetail id={id} basePath="/dashboard-loja" />;
}
