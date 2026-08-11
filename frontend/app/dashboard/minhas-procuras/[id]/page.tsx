import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PurchaseIntentDetail from "@/components/account/PurchaseIntentDetail";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Procura",
  description: "Detalhe da sua procura.",
};

export const dynamic = "force-dynamic";

export default async function ProcuraDetalhePage({ params }: { params: { id: string } }) {
  await requirePfDashboardSession();

  // Id malformado nem chega ao backend. A posse continua sendo garantida lá
  // (WHERE buyer_user_id), então isto é higiene de rota, não autorização.
  const id = /^\d+$/.test(params.id) ? Number.parseInt(params.id, 10) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  return <PurchaseIntentDetail id={id} basePath="/dashboard" />;
}
