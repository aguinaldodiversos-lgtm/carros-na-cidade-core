import type { Metadata } from "next";
import PlanCard from "@/components/plans/PlanCard";
import PlanComparison from "@/components/plans/PlanComparison";
import PlanCTA from "@/components/plans/PlanCTA";
import PlanHero from "@/components/plans/PlanHero";
import { getPlansByType } from "@/lib/plans/plan-service";

export const metadata: Metadata = {
  title: "Planos de assinatura para anunciar carros",
  description:
    "Anunciar carro gratis ou em destaque. Planos para particular e lojista automotivo com cobranca via Mercado Pago.",
  keywords: ["anunciar carro gratis", "plano para lojista automotivo", "vender carro sem comissao"],
  alternates: {
    canonical: "/planos",
  },
  openGraph: {
    title: "Planos Carros na Cidade",
    description:
      "Planos para anunciar carro sem comissao, com destaque premium e cobranca recorrente para lojas.",
    url: "/planos",
    type: "website",
    locale: "pt_BR",
  },
};

export const revalidate = 900;

export default async function PlanosPage() {
  const [cpfPlans, cnpjPlans] = await Promise.all([getPlansByType("CPF"), getPlansByType("CNPJ")]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <PlanHero />

      <section className="mt-8">
        <h2 className="text-[28px] font-extrabold leading-tight text-[#1d2538] sm:text-3xl">
          Planos para particulares
        </h2>
        <p className="mt-1 text-sm text-[#5f6982]">
          CPF validado no backend. Limite gratuito de 3 anúncios ativos com upgrade automático para
          mais volume.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {cpfPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} userType="CPF" />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[28px] font-extrabold leading-tight text-[#1d2538] sm:text-3xl">
          Planos para lojistas
        </h2>
        <p className="mt-1 text-sm text-[#5f6982]">
          CNPJ verificado no backend. Limite gratuito de 20 anúncios ativos e planos pagos com
          destaque e prioridade.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cnpjPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} userType="CNPJ" />
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
        <h2 className="text-2xl font-extrabold text-[#1d2538]">
          Como funciona a cobrança via Mercado Pago
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4">
            <h3 className="text-base font-extrabold text-[#1e2b45]">Plano Destaque (avulso)</h3>
            <ul className="mt-2 space-y-1 text-sm text-[#4d5872]">
              <li>Pagamento único via checkout do Mercado Pago.</li>
              <li>Validade do destaque definida por plano (ex.: 7 ou 30 dias).</li>
              <li>
                Após aprovação no webhook, destaque e prioridade são ativados automaticamente.
              </li>
              <li>Ao vencer, prioridade e badge premium são removidos sem ação manual.</li>
            </ul>
          </article>

          <article className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4">
            <h3 className="text-base font-extrabold text-[#1e2b45]">
              Planos de Loja (recorrentes)
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-[#4d5872]">
              <li>Assinatura mensal via preapproval do Mercado Pago.</li>
              <li>Status atualizado automaticamente por webhook validado.</li>
              <li>Se houver inadimplência, benefícios premium são suspensos.</li>
              <li>Anúncios podem permanecer ativos conforme política da conta.</li>
            </ul>
          </article>
        </div>

        <div className="mt-4 rounded-xl border border-[#d9e5ff] bg-[#edf4ff] p-4">
          <p className="text-sm text-[#435372]">
            Segurança aplicada no backend: validação de assinatura do webhook, verificação de valor
            e plan_id, idempotência para evitar ativação duplicada e confirmação server-to-server do
            status no Mercado Pago.
          </p>
        </div>
      </section>

      <PlanComparison />
      <PlanCTA />
    </main>
  );
}
