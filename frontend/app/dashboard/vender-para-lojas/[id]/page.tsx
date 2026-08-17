import type { Metadata } from "next";
import Link from "next/link";
import SaleRequestDetail from "@/components/account/SaleRequestDetail";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Solicitação de venda",
  description: "Detalhes do veículo que você enviou para as lojas.",
  // Sem canonical por id: é página privada, não indexável, e um canonical
  // apontando para um recurso autenticado não tem significado nenhum.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SolicitacaoDetalhePage({ params }: { params: { id: string } }) {
  await requirePfDashboardSession();

  return (
    <section>
      <Link
        href="/dashboard/vender-para-lojas"
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Vender para lojas
      </Link>

      <div className="mt-3">
        <SaleRequestDetail id={params.id} />
      </div>
    </section>
  );
}
