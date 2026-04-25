export type PlanType = "CPF" | "CNPJ";
export type SubscriptionStatus = "active" | "expired" | "canceled" | "pending";
export type PaymentStatus = "pending" | "approved" | "rejected" | "canceled";
export type PaymentType = "one_time" | "recurring";

export type SubscriptionPlan = {
  id: string;
  name: string;
  type: PlanType;
  price: number;
  ad_limit: number;
  is_featured_enabled: boolean;
  has_store_profile: boolean;
  priority_level: number;
  is_active: boolean;
  validity_days: number | null;
  created_at: string;
  updated_at: string;
  billing_model: "free" | "one_time" | "monthly";
  description: string;
  benefits: string[];
  recommended?: boolean;
};

export type UserSubscription = {
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  expires_at: string | null;
  payment_id: string | null;
  created_at: string;
};

export type PaymentRecord = {
  id: string;
  user_id: string;
  plan_id: string;
  mercado_pago_id: string;
  status: PaymentStatus;
  amount: number;
  payment_type: PaymentType;
  created_at: string;
  updated_at: string;
};

type UserRecord = {
  user_id: string;
  name: string;
  document_type: PlanType;
  document: string;
  cnpj_verified: boolean;
};

type UserAd = {
  id: string;
  user_id: string;
  status: "active" | "paused" | "sold";
};

const nowIso = () => new Date().toISOString();

const planSeed: SubscriptionPlan[] = [
  {
    id: "cpf-free-essential",
    name: "Plano Gratuito (Essencial)",
    type: "CPF",
    price: 0,
    ad_limit: 3,
    is_featured_enabled: false,
    has_store_profile: false,
    priority_level: 0,
    is_active: true,
    validity_days: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    billing_model: "free",
    description: "Ideal para pessoa fisica que quer anunciar sem mensalidade.",
    benefits: [
      "Ate 3 anuncios ativos por CPF",
      "Contato direto via WhatsApp",
      "Sem comissao por venda",
    ],
  },
  {
    id: "cpf-premium-highlight",
    name: "Plano Destaque Premium",
    type: "CPF",
    price: 79.9,
    ad_limit: 10,
    is_featured_enabled: true,
    has_store_profile: false,
    priority_level: 50,
    is_active: true,
    validity_days: 30,
    created_at: nowIso(),
    updated_at: nowIso(),
    billing_model: "one_time",
    description: "Destaque no topo da busca com mais visibilidade para vender mais rapido.",
    benefits: [
      "Destaque no topo da busca",
      "Badge premium no anuncio",
      "Prioridade de exibicao por 30 dias",
    ],
    recommended: true,
  },
  {
    id: "cnpj-free-store",
    name: "Plano Gratuito Loja",
    type: "CNPJ",
    price: 0,
    ad_limit: 20,
    is_featured_enabled: false,
    has_store_profile: true,
    priority_level: 5,
    is_active: true,
    validity_days: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    billing_model: "free",
    description: "Para lojas com CNPJ verificado iniciarem no portal sem mensalidade.",
    benefits: ["Ate 20 anuncios ativos", "Perfil de loja ativo", "Sem comissao nas vendas"],
  },
  {
    id: "cnpj-store-start",
    name: "Plano Loja Start",
    type: "CNPJ",
    price: 299.9,
    ad_limit: 80,
    is_featured_enabled: true,
    has_store_profile: true,
    priority_level: 60,
    is_active: true,
    validity_days: 30,
    created_at: nowIso(),
    updated_at: nowIso(),
    billing_model: "monthly",
    description: "Plano de entrada para escalar anuncios da loja com destaque opcional.",
    benefits: ["Ate 80 anuncios", "Perfil de loja personalizado", "Destaques configuraveis"],
  },
  {
    id: "cnpj-store-pro",
    name: "Plano Loja Pro",
    type: "CNPJ",
    price: 599.9,
    ad_limit: 200,
    is_featured_enabled: true,
    has_store_profile: true,
    priority_level: 80,
    is_active: true,
    validity_days: 30,
    created_at: nowIso(),
    updated_at: nowIso(),
    billing_model: "monthly",
    description: "Mais anuncios, destaque automatico e estatisticas avancadas.",
    benefits: ["Ate 200 anuncios", "Destaque automatico", "Dashboard de performance por cidade"],
    recommended: true,
  },
  {
    id: "cnpj-evento-premium",
    name: "Plano Evento Premium",
    type: "CNPJ",
    price: 999.9,
    ad_limit: 350,
    is_featured_enabled: true,
    has_store_profile: true,
    priority_level: 100,
    is_active: true,
    validity_days: 30,
    created_at: nowIso(),
    updated_at: nowIso(),
    billing_model: "monthly",
    description: "Impulsionamento regional com banner promocional e campanha especial.",
    benefits: [
      "Banner promocional na home regional",
      "Impulsionamento geolocalizado",
      "Ate 350 anuncios ativos",
    ],
  },
];

const users: UserRecord[] = [
  {
    user_id: "user-cpf-demo",
    name: "Carlos Silva",
    document_type: "CPF",
    document: "39053344705",
    cnpj_verified: false,
  },
  {
    user_id: "user-cnpj-demo",
    name: "Loja Centro Car",
    document_type: "CNPJ",
    document: "11222333000181",
    cnpj_verified: true,
  },
];

const userAds: UserAd[] = [
  { id: "ad-1", user_id: "user-cpf-demo", status: "active" },
  { id: "ad-2", user_id: "user-cpf-demo", status: "active" },
  { id: "ad-3", user_id: "user-cpf-demo", status: "active" },
  { id: "ad-4", user_id: "user-cnpj-demo", status: "active" },
  { id: "ad-5", user_id: "user-cnpj-demo", status: "active" },
];

const userSubscriptions: UserSubscription[] = [];
const payments: PaymentRecord[] = [];
const processedWebhookEvents = new Set<string>();

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidCPF(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let first = (sum * 10) % 11;
  if (first === 10) first = 0;
  if (first !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let second = (sum * 10) % 11;
  if (second === 10) second = 0;
  return second === Number(cpf[10]);
}

export function isValidCNPJ(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  const calc = (base: string, factors: number[]) => {
    const total = factors.reduce((sum, factor, idx) => sum + Number(base[idx]) * factor, 0);
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calc(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(cnpj.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}` === cnpj.slice(12);
}

export function getPlans({
  type,
  onlyActive = true,
}: { type?: PlanType; onlyActive?: boolean } = {}) {
  return planSeed
    .filter((plan) => (type ? plan.type === type : true))
    .filter((plan) => (onlyActive ? plan.is_active : true));
}

export function getPlanById(planId: string) {
  return planSeed.find((plan) => plan.id === planId);
}

export function updatePlanById(
  planId: string,
  payload: Partial<
    Pick<
      SubscriptionPlan,
      | "name"
      | "price"
      | "ad_limit"
      | "is_featured_enabled"
      | "has_store_profile"
      | "priority_level"
      | "is_active"
      | "validity_days"
      | "description"
      | "benefits"
      | "recommended"
    >
  >
) {
  const plan = getPlanById(planId);
  if (!plan) return null;

  if (payload.name !== undefined) plan.name = payload.name;
  if (payload.price !== undefined) plan.price = payload.price;
  if (payload.ad_limit !== undefined) plan.ad_limit = payload.ad_limit;
  if (payload.is_featured_enabled !== undefined)
    plan.is_featured_enabled = payload.is_featured_enabled;
  if (payload.has_store_profile !== undefined) plan.has_store_profile = payload.has_store_profile;
  if (payload.priority_level !== undefined) plan.priority_level = payload.priority_level;
  if (payload.is_active !== undefined) plan.is_active = payload.is_active;
  if (payload.validity_days !== undefined) plan.validity_days = payload.validity_days;
  if (payload.description !== undefined) plan.description = payload.description;
  if (payload.benefits !== undefined) plan.benefits = payload.benefits;
  if (payload.recommended !== undefined) plan.recommended = payload.recommended;
  plan.updated_at = nowIso();

  return plan;
}

export function getUserById(userId: string) {
  return users.find((user) => user.user_id === userId);
}

export function countActiveAdsByUser(userId: string) {
  return userAds.filter((ad) => ad.user_id === userId && ad.status === "active").length;
}

export function getActiveSubscription(userId: string) {
  const now = Date.now();
  const active = userSubscriptions.find((sub) => {
    if (sub.user_id !== userId || sub.status !== "active") return false;
    if (!sub.expires_at) return true;
    return new Date(sub.expires_at).getTime() > now;
  });
  return active ?? null;
}

export function validatePublishEligibility(userId: string) {
  const user = getUserById(userId);
  if (!user) {
    return {
      allowed: false,
      reason: "Usuario nao encontrado",
      suggested_plan_type: null as PlanType | null,
    };
  }

  if (user.document_type === "CPF" && !isValidCPF(user.document)) {
    return { allowed: false, reason: "CPF invalido", suggested_plan_type: "CPF" as PlanType };
  }

  if (user.document_type === "CNPJ") {
    if (!isValidCNPJ(user.document)) {
      return { allowed: false, reason: "CNPJ invalido", suggested_plan_type: "CNPJ" as PlanType };
    }
    if (!user.cnpj_verified) {
      return {
        allowed: false,
        reason: "CNPJ precisa estar verificado para publicar no plano gratuito",
        suggested_plan_type: "CNPJ" as PlanType,
      };
    }
  }

  const activeAds = countActiveAdsByUser(userId);
  const activeSubscription = getActiveSubscription(userId);
  if (activeSubscription) {
    const plan = getPlanById(activeSubscription.plan_id);
    if (!plan) {
      return {
        allowed: false,
        reason: "Plano da assinatura nao encontrado",
        suggested_plan_type: user.document_type,
      };
    }
    if (activeAds < plan.ad_limit) {
      return {
        allowed: true,
        reason: "Limite disponivel no plano ativo",
        suggested_plan_type: null,
      };
    }
    return {
      allowed: false,
      reason: "Limite do plano ativo atingido",
      suggested_plan_type: user.document_type,
    };
  }

  const freeLimit = user.document_type === "CPF" ? 3 : 20;
  if (activeAds < freeLimit) {
    return { allowed: true, reason: "Limite gratuito disponivel", suggested_plan_type: null };
  }

  return {
    allowed: false,
    reason:
      user.document_type === "CPF"
        ? "Limite de 3 anuncios gratuitos por CPF atingido"
        : "Limite de 20 anuncios gratuitos por CNPJ atingido",
    suggested_plan_type: user.document_type,
  };
}

export function createOrUpdateSubscription(data: {
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  expires_at: string | null;
  payment_id: string | null;
}) {
  const existing = userSubscriptions.find(
    (item) =>
      item.user_id === data.user_id && item.plan_id === data.plan_id && item.status === "active"
  );
  if (existing) {
    existing.status = data.status;
    existing.expires_at = data.expires_at;
    existing.payment_id = data.payment_id;
    return existing;
  }

  const created: UserSubscription = {
    user_id: data.user_id,
    plan_id: data.plan_id,
    status: data.status,
    expires_at: data.expires_at,
    payment_id: data.payment_id,
    created_at: nowIso(),
  };
  userSubscriptions.push(created);
  return created;
}

export function registerPayment(data: Omit<PaymentRecord, "id" | "created_at" | "updated_at">) {
  const existingByExternalId = payments.find(
    (payment) => payment.mercado_pago_id === data.mercado_pago_id
  );
  if (existingByExternalId) {
    existingByExternalId.status = data.status;
    existingByExternalId.updated_at = nowIso();
    return existingByExternalId;
  }

  const record: PaymentRecord = {
    id: `pay-${payments.length + 1}`,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...data,
  };
  payments.push(record);
  return record;
}

export function markWebhookEventProcessed(eventId: string) {
  if (processedWebhookEvents.has(eventId)) {
    return false;
  }
  processedWebhookEvents.add(eventId);
  return true;
}

export function listUserSubscriptions(userId: string) {
  return userSubscriptions.filter((sub) => sub.user_id === userId);
}

export function listPaymentsByUser(userId: string) {
  return payments.filter((payment) => payment.user_id === userId);
}
