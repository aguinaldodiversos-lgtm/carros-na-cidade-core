/**
 * Configuração ÚNICA dos 4 cards comerciais da Revisão (step 5):
 *   1. Destaque 7 dias  (boost avulso)
 *   2. Lojista Pro      (assinatura mensal)
 *   3. Lojista Start    (assinatura mensal)
 *   4. Grátis           (publicação sem custo)
 *
 * A cópia (títulos, descrições, benefícios, selos, botões) é centralizada
 * aqui — não espalhada nos componentes (spec §14). Os PREÇOS vêm dos dados
 * reais quando disponíveis (`dashboard.boost_options` para o Destaque e
 * `/api/plans` → plan-store para Pro/Start/Grátis); os valores oficiais de
 * lançamento (R$ 39,90 / R$ 149,90 / R$ 79,90 / R$ 0) ficam como fallback.
 *
 * Não duplica a lógica de planos: consome `SubscriptionPlan`/`BoostOption`
 * já modelados no projeto.
 */

import type { BoostOption } from "@/lib/dashboard-types";
import type { SubscriptionPlan } from "@/lib/plans/plan-store";

export type MonetizationKey = "boost-7d" | "lojista-pro" | "lojista-start" | "free";
export type MonetizationStyle = "accent" | "highlight" | "neutral" | "free";
export type MonetizationAction = "publish-free" | "publish-boost" | "subscribe";

export type MonetizationCard = {
  key: MonetizationKey;
  /** plan_id real (assinaturas) — usado no checkout. */
  planId?: string;
  name: string;
  badge?: string;
  /** Valor numérico (para Intl) e rótulo já formatado para exibição. */
  price: number;
  priceLabel: string;
  period: string;
  description: string;
  benefits: string[];
  cautions?: string[];
  buttonLabel: string;
  style: MonetizationStyle;
  action: MonetizationAction;
  /** Sticky bar mostra "Continuar para pagamento" quando true. */
  requiresPayment: boolean;
};

export const SUBSCRIPTION_PLAN_IDS = {
  pro: "cnpj-store-pro",
  start: "cnpj-store-start",
} as const;

const PLACEHOLDER_PRICES = {
  boost: 39.9,
  pro: 149.9,
  start: 79.9,
} as const;

function brl(value: number): string {
  if (value <= 0) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/**
 * Monta os 4 cards na ordem oficial (spec §9). Preço do Destaque vem do
 * boost real do dashboard quando presente; Pro/Start do catálogo de planos.
 */
export function buildMonetizationCards(input: {
  plans?: SubscriptionPlan[];
  boostOption?: BoostOption | null;
}): MonetizationCard[] {
  const plans = input.plans ?? [];
  const findPlan = (id: string) => plans.find((p) => p.id === id);

  const boostPrice = input.boostOption?.price ?? PLACEHOLDER_PRICES.boost;
  const proPrice = findPlan(SUBSCRIPTION_PLAN_IDS.pro)?.price ?? PLACEHOLDER_PRICES.pro;
  const startPrice = findPlan(SUBSCRIPTION_PLAN_IDS.start)?.price ?? PLACEHOLDER_PRICES.start;

  return [
    {
      key: "boost-7d",
      name: "Destaque 7 dias",
      badge: "TOP POR 7 DIAS",
      price: boostPrice,
      priceLabel: brl(boostPrice),
      period: "por anúncio",
      description: "Coloque um anúncio no topo das listagens da sua cidade por 7 dias.",
      benefits: [
        "Posição de destaque no catálogo por 7 dias",
        "Disponível para CPF e CNPJ",
        "Compras repetidas prorrogam o tempo no topo",
      ],
      cautions: [
        "Não libera vídeo 360",
        "Não altera o limite de fotos",
        "Não altera o limite de anúncios",
      ],
      buttonLabel: "Destacar agora",
      style: "accent",
      action: "publish-boost",
      requiresPayment: true,
    },
    {
      key: "lojista-pro",
      planId: SUBSCRIPTION_PLAN_IDS.pro,
      name: "Lojista Pro",
      badge: "RECOMENDADO",
      price: proPrice,
      priceLabel: brl(proPrice),
      period: "/mês",
      description: "Mais exposição para sua loja, com prioridade comercial superior ao Start.",
      benefits: [
        "Mais exposição da loja nas listagens",
        "Mais anúncios ativos no lançamento, com limite operacional",
        "Prioridade comercial superior ao Start",
        "Perfil de loja com identidade visual",
      ],
      buttonLabel: "Assinar Pro",
      style: "highlight",
      action: "subscribe",
      requiresPayment: true,
    },
    {
      key: "lojista-start",
      planId: SUBSCRIPTION_PLAN_IDS.start,
      name: "Lojista Start",
      price: startPrice,
      priceLabel: brl(startPrice),
      period: "/mês",
      description:
        "Plano de entrada para lojas começarem a operação digital com presença consistente.",
      benefits: [
        "Até 20 anúncios ativos",
        "Mais presença nas listagens",
        "Ideal para lojas em início de operação digital",
        "Perfil de loja personalizado",
      ],
      buttonLabel: "Assinar Start",
      style: "neutral",
      action: "subscribe",
      requiresPayment: true,
    },
    {
      key: "free",
      name: "Grátis",
      price: 0,
      priceLabel: "R$ 0",
      period: "para sempre",
      description: "Comece a anunciar sem custos respeitando os limites de CPF ou CNPJ.",
      benefits: [
        "Pessoa física: até 3 anúncios",
        "Loja com CNPJ: até 10 anúncios",
        "Até 8 fotos por anúncio",
        "CPF ou CNPJ validado",
      ],
      buttonLabel: "Começar grátis",
      style: "free",
      action: "publish-free",
      requiresPayment: false,
    },
  ];
}

/** Linhas do comparativo "Compare as opções" (spec §15). */
export const COMPARISON_ROWS: ReadonlyArray<{
  label: string;
  values: Record<MonetizationKey, string>;
}> = [
  {
    label: "Posição na lista",
    values: {
      "boost-7d": "Topo por mais tempo",
      "lojista-pro": "Topo",
      "lojista-start": "Topo",
      free: "Padrão",
    },
  },
  {
    label: "Selo de destaque",
    values: { "boost-7d": "Sim", "lojista-pro": "Sim", "lojista-start": "Sim", free: "Não" },
  },
  {
    label: "Mais visibilidade",
    values: { "boost-7d": "Sim", "lojista-pro": "Sim", "lojista-start": "Sim", free: "Não" },
  },
  {
    label: "Ideal para",
    values: {
      "boost-7d": "Vendas em poucos dias",
      "lojista-pro": "Lojas e revendas profissionais",
      "lojista-start": "Lojas em crescimento",
      free: "Vendedores ocasionais",
    },
  },
  {
    label: "Quantidade de anúncios",
    values: {
      "boost-7d": "1",
      "lojista-pro": "Limite operacional",
      "lojista-start": "Até 20",
      free: "Até 3 PF / até 10 CNPJ",
    },
  },
];

/** Faixa de confiança (spec §16). */
export const TRUST_ITEMS = [
  { icon: "shield", title: "Pagamento seguro", text: "Ambiente 100% seguro e criptografado." },
  { icon: "zap", title: "Ativação imediata", text: "Seu anúncio em destaque na hora." },
  { icon: "handshake", title: "Sem fidelidade", text: "Cancele quando quiser, sem burocracia." },
  {
    icon: "headset",
    title: "Suporte especializado",
    text: "Nossa equipe está pronta para te ajudar.",
  },
] as const;
