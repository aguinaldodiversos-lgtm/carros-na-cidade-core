import type { Metadata } from "next";
import Link from "next/link";
import PurchaseIntentForm from "@/components/account/PurchaseIntentForm";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Publicar uma procura",
  description: "Diga qual carro você procura.",
  alternates: { canonical: "/dashboard/minhas-procuras/nova" },
};

export const dynamic = "force-dynamic";

/**
 * Segmento estático `nova` convive com o dinâmico `[id]` porque o App Router
 * resolve o literal primeiro — `/minhas-procuras/nova` nunca cai no detalhe.
 */
export default async function NovaProcuraPage() {
  await requirePfDashboardSession();

  return (
    <section>
      <Link
        href="/dashboard/minhas-procuras"
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Minhas procuras
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">Publicar uma procura</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Escolha o que você procura e a cidade. As lojas dessa cidade poderão encontrar a sua
          procura.
        </p>
      </header>

      <PurchaseIntentForm basePath="/dashboard" />
    </section>
  );
}
