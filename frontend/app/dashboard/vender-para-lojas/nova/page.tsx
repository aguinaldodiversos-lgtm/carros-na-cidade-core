import type { Metadata } from "next";
import Link from "next/link";
import SaleRequestForm from "@/components/account/SaleRequestForm";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Enviar meu carro para as lojas",
  description: "Cadastre o seu veículo para as lojas da sua cidade avaliarem.",
  alternates: { canonical: "/dashboard/vender-para-lojas/nova" },
};

export const dynamic = "force-dynamic";

/**
 * Segmento estático `nova` convive com o dinâmico `[id]` porque o App Router
 * resolve o literal primeiro — `/vender-para-lojas/nova` nunca cai no detalhe.
 * Mesmo arranjo já usado por `minhas-procuras/nova`.
 */
export default async function NovaSolicitacaoPage() {
  await requirePfDashboardSession();

  return (
    <section>
      <Link
        href="/dashboard/vender-para-lojas"
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Vender para lojas
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">
          Enviar meu carro para as lojas
        </h1>
        {/*
          O texto descreve o que ACONTECE agora e o que virá depois, sem
          prometer oferta para hoje: a distribuição para lojistas é a Fase 4.2 e
          os lances são a 4.3. Afirmar "receba propostas" antes disso faria a
          pessoa esperar por algo que o produto ainda não entrega.
        */}
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Seu veículo será mostrado a lojas da sua cidade para que elas possam avaliar e, nas
          próximas etapas do serviço, enviar propostas de compra.
        </p>
      </header>

      <SaleRequestForm basePath="/dashboard" />
    </section>
  );
}
