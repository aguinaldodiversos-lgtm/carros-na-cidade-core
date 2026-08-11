import type { Metadata } from "next";
import DealerOpportunitiesList from "@/components/account/DealerOpportunitiesList";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Compradores ativos",
  description: "Pessoas da sua cidade procurando veículos.",
  alternates: { canonical: "/dashboard-loja/oportunidades/compradores" },
};

export const dynamic = "force-dynamic";

/**
 * `requireLojistaDashboardSession` redireciona não-CNPJ para /dashboard, mas
 * isso é NAVEGAÇÃO, não autorização: a API tem a própria guarda
 * (`requireDealerAccount`) e é ela que decide de fato.
 */
export default async function CompradoresAtivosPage() {
  await requireLojistaDashboardSession();
  return <DealerOpportunitiesList basePath="/dashboard-loja" />;
}
