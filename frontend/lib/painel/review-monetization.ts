/**
 * Opções comerciais do passo final. Usa os mesmos benefícios e registros
 * da página pública /planos; nenhuma cobrança é calculada pelo navegador.
 */
import type { BoostOption } from "@/lib/dashboard-types";
import type { SubscriptionPlan } from "@/lib/plans/plan-store";
import {
  boostBenefits,
  freePlanBenefits,
  subscriptionBenefits,
  subscriptionIntro,
  FREE_PLAN_INTRO,
} from "@/lib/plans/commercial-benefits";

export type MonetizationKey = "boost-7d" | "lojista-pro" | "lojista-start" | "free";
export type MonetizationStyle = "accent" | "highlight" | "neutral" | "free";
export type MonetizationAction = "publish-free" | "publish-boost" | "subscribe";

export type MonetizationCard = {
  key: MonetizationKey;
  planId?: string;
  name: string;
  badge?: string;
  price: number;
  priceLabel: string;
  period: string;
  description: string;
  benefits: string[];
  note?: string;
  buttonLabel: string;
  style: MonetizationStyle;
  action: MonetizationAction;
  requiresPayment: boolean;
};

export const SUBSCRIPTION_PLAN_IDS = {
  pro: "cnpj-store-pro",
  start: "cnpj-store-start",
} as const;

function brl(value: number): string {
  if (value === 0) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Somente produtos disponíveis e preços efetivamente confirmados pela API.
 * A opção gratuita permanece disponível em falha de rede — o backend volta
 * a validar elegibilidade e limites no instante da publicação.
 */
export function buildMonetizationCards(input: {
  plans?: SubscriptionPlan[];
  boostOption?: BoostOption | null;
  accountType?: "CPF" | "CNPJ" | "pending";
}): MonetizationCard[] {
  const catalog = (input.plans ?? []).filter(
    (plan) => plan.is_active && plan.public_visible !== false
  );
  const find = (id: string) => catalog.find((plan) => plan.id === id);
  const cpfFree = find("cpf-free-essential");
  const cnpjFree = find("cnpj-free-store");

  const cards: MonetizationCard[] = [];
  const boost = input.boostOption;
  if (boost && boost.days === 7 && Number.isFinite(boost.price) && boost.price > 0) {
    cards.push({
      key: "boost-7d",
      name: boost.label || "Destaque 7 dias",
      badge: "TOPO POR 7 DIAS",
      price: boost.price,
      priceLabel: brl(boost.price),
      period: "por anúncio",
      description: "Coloque seu anúncio no topo das listagens locais e regionais por 7 dias.",
      benefits: boostBenefits(7),
      note: "Mantém os limites de fotos e anúncios do seu plano.",
      buttonLabel: "Destacar agora",
      style: "accent",
      action: "publish-boost",
      requiresPayment: true,
    });
  }

  if (input.accountType === "CNPJ") {
    for (const tier of ["pro", "start"] as const) {
      const plan = find(SUBSCRIPTION_PLAN_IDS[tier]);
      if (!plan || plan.subscribable !== true || !Number.isFinite(Number(plan.price))) continue;
      const pro = tier === "pro";
      cards.push({
        key: pro ? "lojista-pro" : "lojista-start",
        planId: plan.id,
        name: pro ? "Lojista Pro" : "Lojista Start",
        badge: plan.recommended ? "MAIS COMPLETO" : undefined,
        price: Number(plan.price),
        priceLabel: brl(Number(plan.price)),
        period: "/mês",
        description: subscriptionIntro(plan, tier),
        benefits: subscriptionBenefits(plan, tier),
        note: pro && plan.ad_limit >= 1000 ? "*Sujeito à trava técnica de segurança." : undefined,
        buttonLabel: pro ? "Assinar Pro" : "Assinar Start",
        style: pro ? "highlight" : "neutral",
        action: "subscribe",
        requiresPayment: true,
      });
    }
  }

  cards.push({
    key: "free",
    name: "Grátis",
    price: 0,
    priceLabel: "R$ 0",
    period: "para sempre",
    description: FREE_PLAN_INTRO,
    benefits:
      input.plans === undefined
        ? ["Publique sem custo, respeitando os limites do seu cadastro."]
        : freePlanBenefits(
            cpfFree,
            cnpjFree,
            input.accountType === "pending" ? undefined : input.accountType
          ),
    buttonLabel: "Começar grátis",
    style: "free",
    action: "publish-free",
    requiresPayment: false,
  });

  return cards;
}

export const TRUST_ITEMS = [
  { icon: "shield", title: "Contratação transparente", text: "Confira o valor antes de pagar." },
  {
    icon: "zap",
    title: "Anúncio sujeito à revisão",
    text: "A publicação segue as regras do portal.",
  },
  {
    icon: "handshake",
    title: "Sem comissão",
    text: "Contato direto entre anunciante e comprador.",
  },
  { icon: "headset", title: "Suporte", text: "Ajuda disponível quando precisar." },
] as const;
