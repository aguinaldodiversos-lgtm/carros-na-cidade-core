import Link from "next/link";
import type { SubscriptionPlan } from "@/services/planStore";
import PlanCheckoutButton from "@/components/plans/PlanCheckoutButton";

type PlanCardProps = {
  plan: SubscriptionPlan;
  userType: "CPF" | "CNPJ";
};

function formatPrice(value: number) {
  if (value === 0) return "Gratis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function PlanCard({ plan, userType }: PlanCardProps) {
  const isRecommended = Boolean(plan.recommended);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_3px_18px_rgba(11,22,44,0.06)] ${
        isRecommended ? "border-[#0e62d8] ring-2 ring-[#0e62d8]/20" : "border-[#dfe4ef]"
      }`}
    >
      {isRecommended && (
        <span className="absolute right-4 top-4 rounded-full bg-[#0e62d8] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          Recomendado
        </span>
      )}

      <p className="text-xs font-bold uppercase tracking-wide text-[#5f6982]">{userType === "CPF" ? "Particular" : "Lojista"}</p>
      <h3 className="mt-1 text-2xl font-extrabold text-[#1d2538]">{plan.name}</h3>
      <p className="mt-1 text-sm text-[#5a647d]">{plan.description}</p>

      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-extrabold text-[#0e62d8]">{formatPrice(plan.price)}</span>
        {plan.billing_model === "monthly" && <span className="pb-1 text-sm font-semibold text-[#5a647d]">/mes</span>}
      </div>

      <div className="mt-4 rounded-xl border border-[#e2e6f0] bg-[#f8fafe] p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[#5f6980]">Limites e prioridade</p>
        <p className="mt-1 text-sm font-semibold text-[#2b3550]">Ate {plan.ad_limit} anuncios ativos</p>
        <p className="text-sm text-[#4e5973]">Prioridade na busca: {plan.priority_level}</p>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-[#4f5972]">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="inline-flex items-start gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[#0e62d8]" />
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-2 text-xs text-[#5f6982]">
        <p>Destaque habilitado: {plan.is_featured_enabled ? "Sim" : "Nao"}</p>
        <p>Perfil de loja: {plan.has_store_profile ? "Sim" : "Nao"}</p>
        <p>Validade: {plan.validity_days ? `${plan.validity_days} dias` : "Sem expirar"}</p>
      </div>

      {plan.billing_model === "free" ? (
        <Link
          href="/anunciar"
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] text-sm font-bold text-white transition hover:brightness-110"
        >
          Comecar gratis
        </Link>
      ) : (
        <PlanCheckoutButton
          endpoint={plan.billing_model === "monthly" ? "/api/payments/subscription" : "/api/payments/create"}
          planId={plan.id}
          userId={userType === "CPF" ? "user-cpf-demo" : "user-cnpj-demo"}
          label={plan.billing_model === "monthly" ? "Assinar plano" : "Comprar destaque"}
        />
      )}
    </article>
  );
}
