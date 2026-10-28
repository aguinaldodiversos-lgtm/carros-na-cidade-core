import type { SubscriptionPlan } from "@/lib/plans/plan-store";

/**
 * Fonte compartilhada para /planos e etapa final do anúncio.
 * Limites e pesos usam os campos operacionais do catálogo administrado.
 * Benefícios livres são filtrados apenas para evitar ofertas não implementadas.
 */
export function commercialAdditionalBenefits(plan: SubscriptionPlan): string[] {
  return (plan.benefits ?? [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        !/v[ií]deo|360|cr[eé]dito|destaque mensal|destaques mensais|dashboard de performance|banner regional/i.test(
          item
        )
    )
    .filter(
      (item) =>
        !/an[uú]ncios?|fotos?|prioridade|peso [1234]|perfil de loja|visibilidade|listagens/i.test(
          item
        )
    )
    .slice(0, 2);
}

export function subscriptionBenefits(plan: SubscriptionPlan, tier: "pro" | "start"): string[] {
  const pro = tier === "pro";
  const ranking = Number(plan.weight ?? (pro ? 3 : 2));
  return [
    pro && plan.ad_limit >= 1000 ? "Anúncios ilimitados*" : `Até ${plan.ad_limit} anúncios ativos`,
    `${pro ? "Maior prioridade nas listagens" : "Prioridade nas listagens"} (peso ${ranking})`,
    ...(plan.has_store_profile ? ["Perfil de loja personalizado"] : []),
    ...commercialAdditionalBenefits(plan),
  ];
}

export function subscriptionIntro(plan: SubscriptionPlan, tier: "pro" | "start"): string {
  // Não anunciar vantagem de quantidade de fotos: o limite de upload
  // é uma regra operacional, não um diferencial comercial dos cards.
  const intro = plan.description
    ?.replace(/,\s*mais fotos\s+e\s+/gi, " e ")
    .replace(/\bmais fotos\b/gi, "")
    .trim();
  return (
    intro ||
    (tier === "pro"
      ? "Mais visibilidade e oportunidades para sua loja."
      : "Sua loja com mais presença nas buscas locais.")
  );
}

export function freePlanBenefits(
  cpf?: SubscriptionPlan,
  cnpj?: SubscriptionPlan,
  accountType?: "CPF" | "CNPJ"
): string[] {
  return [
    ...(accountType !== "CNPJ" ? [`Até ${cpf?.ad_limit ?? 3} anúncios (pessoa física)`] : []),
    ...(accountType !== "CPF" ? [`Até ${cnpj?.ad_limit ?? 10} anúncios (loja com CNPJ)`] : []),
    "Presença nas listagens locais e regionais",
    ...(accountType !== "CPF" && cnpj?.has_store_profile ? ["Perfil básico da loja"] : []),
  ];
}

export function boostBenefits(days: number): string[] {
  return [
    `Topo das listagens por ${days} dias (peso 4)`,
    "Disponível para CPF e CNPJ",
    "Destaque avulso, sem mensalidade",
  ];
}

export const FREE_PLAN_INTRO =
  "Comece a anunciar sem custos, respeitando os limites de CPF ou CNPJ.";
