import type { Metadata } from "next";
import PurchaseIntentsList from "@/components/account/PurchaseIntentsList";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Minhas procuras",
  description: "Procuras publicadas para as lojas da sua cidade.",
  alternates: { canonical: "/dashboard/minhas-procuras" },
};

export const dynamic = "force-dynamic";

/**
 * Nenhum middleware cobre /dashboard*: a sessão é conferida por arquivo, e o
 * layout chamar o helper NÃO protege as páginas filhas. Sem esta linha a rota
 * seria publicamente alcançável.
 */
export default async function MinhasProcurasPage() {
  await requirePfDashboardSession();
  return <PurchaseIntentsList basePath="/dashboard" />;
}
