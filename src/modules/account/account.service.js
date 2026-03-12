import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as adsRepository from "../ads/ads.repository.js";

const DEFAULT_PLANS = [
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
    billing_model: "free",
    description: "Ideal para pessoa fisica que quer anunciar sem mensalidade.",
    benefits: ["Ate 3 anuncios ativos por CPF", "Contato direto via WhatsApp", "Sem comissao por venda"],
    recommended: false,
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
    billing_model: "one_time",
    description: "Destaque no topo da busca com mais visibilidade para vender mais rapido.",
    benefits: ["Destaque no topo da busca", "Badge premium no anuncio", "Prioridade de exibicao por 30 dias"],
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
    billing_model: "free",
    description: "Para lojas com CNPJ verificado iniciarem no portal sem mensalidade.",
    benefits: ["Ate 20 anuncios ativos", "Perfil de loja ativo", "Sem comissao nas vendas"],
    recommended: false,
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
    billing_model: "monthly",
    description: "Plano de entrada para escalar anuncios da loja com destaque opcional.",
    benefits: ["Ate 80 anuncios", "Perfil de loja personalizado", "Destaques configuraveis"],
    recommended: false,
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
    billing_model: "monthly",
    description: "Impulsionamento regional com banner promocional e campanha especial.",
    benefits: ["Banner promocional na home regional", "Impulsionamento geolocalizado", "Ate 350 anuncios ativos"],
    recommended: false,
  },
];

const BOOST_OPTIONS = [
  {
    id: "boost-7d",
    days: 7,
    price: 39.9,
    label: "Destaque por 7 dias",
    description: "Prioridade alta nas buscas e badge de destaque por 7 dias.",
  },
  {
    id: "boost-30d",
    days: 30,
    price: 129.9,
    label: "Destaque por 30 dias",
    description: "Exibicao premium no topo, carrossel principal e reforco de recomendacao IA.",
  },
];

function normalizeAccountType(input) {
  return String(input ?? "").trim().toUpperCase() === "CNPJ" ? "CNPJ" : "CPF";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clonePlan(plan) {
  return {
    ...plan,
    benefits: Array.isArray(plan.benefits) ? [...plan.benefits] : [],
  };
}

function mapPlanRow(row) {
  const benefits = Array.isArray(row.benefits)
    ? row.benefits
    : typeof row.benefits === "string"
      ? JSON.parse(row.benefits || "[]")
      : [];

  return {
    id: String(row.id),
    name: String(row.name),
    type: normalizeAccountType(row.type),
    price: toNumber(row.price, 0),
    ad_limit: toNumber(row.ad_limit, 0),
    is_featured_enabled: Boolean(row.is_featured_enabled),
    has_store_profile: Boolean(row.has_store_profile),
    priority_level: toNumber(row.priority_level, 0),
    is_active: Boolean(row.is_active),
    validity_days: row.validity_days === null || row.validity_days === undefined ? null : toNumber(row.validity_days, 0),
    billing_model: row.billing_model || "free",
    description: String(row.description || ""),
    benefits,
    recommended: Boolean(row.recommended),
  };
}

async function queryPlansFromDatabase() {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        type,
        price,
        ad_limit,
        is_featured_enabled,
        has_store_profile,
        priority_level,
        is_active,
        validity_days,
        billing_model,
        description,
        benefits,
        recommended
      FROM subscription_plans
      ORDER BY priority_level ASC, price ASC, name ASC
      `
    );

    if (!result.rows.length) {
      return DEFAULT_PLANS.map(clonePlan);
    }

    return result.rows.map(mapPlanRow);
  } catch {
    return DEFAULT_PLANS.map(clonePlan);
  }
}

function resolveLegacyPlanAlias(planValue, accountType) {
  const normalized = String(planValue || "").trim().toLowerCase();
  if (!normalized || normalized === "free") {
    return accountType === "CNPJ" ? "cnpj-free-store" : "cpf-free-essential";
  }
  if (normalized === "start") return "cnpj-store-start";
  if (normalized === "pro") return "cnpj-store-pro";
  if (normalized === "evento-premium") return "cnpj-evento-premium";
  return normalized;
}

async function getCurrentPlanIdFromDatabase(userId) {
  try {
    const result = await pool.query(
      `
      SELECT us.plan_id
      FROM user_subscriptions us
      WHERE us.user_id = $1
        AND us.status = 'active'
        AND (us.expires_at IS NULL OR us.expires_at > NOW())
      ORDER BY us.created_at DESC
      LIMIT 1
      `,
      [userId]
    );

    return result.rows[0]?.plan_id ? String(result.rows[0].plan_id) : null;
  } catch {
    return null;
  }
}

async function hasSubscriptionHistory(userId) {
  try {
    const result = await pool.query(
      `
      SELECT 1
      FROM user_subscriptions
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    return Boolean(result.rows[0]);
  } catch {
    return false;
  }
}

async function countActiveAdsByUser(userId) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM ads
    WHERE user_id = $1
      AND status = 'active'
    `,
    [userId]
  );

  return toNumber(result.rows[0]?.total, 0);
}

export async function getAccountUser(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      COALESCE(document_type, 'cpf') AS document_type,
      COALESCE(document_verified, false) AS document_verified,
      COALESCE(plan, 'free') AS plan
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  const type = normalizeAccountType(row.document_type);

  return {
    id: String(row.id),
    name: row.name?.trim() || "Usuario",
    email: row.email?.trim() || "",
    type,
    cnpj_verified: type === "CNPJ" ? Boolean(row.document_verified) : false,
    raw_plan: row.plan || "free",
  };
}

export async function listPlans({ type, onlyActive = true } = {}) {
  const plans = await queryPlansFromDatabase();

  return plans
    .filter((plan) => (type ? plan.type === normalizeAccountType(type) : true))
    .filter((plan) => (onlyActive ? plan.is_active : true));
}

export async function getPlanById(planId) {
  const plans = await listPlans({ onlyActive: false });
  return plans.find((plan) => plan.id === planId) ?? null;
}

async function resolveCurrentPlan(user) {
  const plans = await listPlans({ type: user.type, onlyActive: false });
  const planIdFromSubscription = await getCurrentPlanIdFromDatabase(user.id);
  const hasHistory = await hasSubscriptionHistory(user.id);
  const preferredId =
    planIdFromSubscription ||
    (hasHistory
      ? resolveLegacyPlanAlias("free", user.type)
      : resolveLegacyPlanAlias(user.raw_plan, user.type));

  return (
    plans.find((plan) => plan.id === preferredId) ??
    plans.find((plan) => plan.billing_model === "free") ??
    null
  );
}

function getFreeLimit(accountType, cnpjVerified) {
  if (accountType === "CPF") return 3;
  return cnpjVerified ? 20 : 0;
}

function normalizeDashboardAd(row) {
  const featuredUntil = row.highlight_until ? new Date(row.highlight_until).toISOString() : null;
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const fallbackExpiry = new Date(Math.max(createdAt.getTime(), updatedAt.getTime()) + 30 * 24 * 60 * 60 * 1000);
  const isFeatured = featuredUntil ? new Date(featuredUntil).getTime() > Date.now() : false;

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: row.title?.trim() || "Anuncio sem titulo",
    price: toNumber(row.price, 0),
    image_url: "/images/banner1.jpg",
    status: row.status === "paused" ? "paused" : "active",
    is_featured: isFeatured,
    featured_until: featuredUntil,
    priority_level: isFeatured ? "high" : "normal",
    views: 0,
    expires_at: fallbackExpiry.toISOString(),
  };
}

export async function listOwnedAds(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      title,
      price,
      status,
      highlight_until,
      created_at,
      updated_at
    FROM ads
    WHERE user_id = $1
      AND status IN ('active', 'paused')
    ORDER BY
      CASE WHEN status = 'active' THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST,
      created_at DESC NULLS LAST
    `,
    [userId]
  );

  return result.rows.map(normalizeDashboardAd);
}

export async function getOwnedAd(userId, adId) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      title,
      price,
      status,
      highlight_until,
      created_at,
      updated_at
    FROM ads
    WHERE id = $1
      AND user_id = $2
      AND status != 'deleted'
    LIMIT 1
    `,
    [adId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError("Anuncio nao encontrado", 404);
  }

  return normalizeDashboardAd(row);
}

export async function getDashboardPayload(userId) {
  const [user, ads] = await Promise.all([
    getAccountUser(userId),
    listOwnedAds(userId),
  ]);

  const activeAds = ads.filter((ad) => ad.status === "active");
  const pausedAds = ads.filter((ad) => ad.status === "paused");
  const currentPlan = await resolveCurrentPlan(user);
  const freeLimit = getFreeLimit(user.type, user.cnpj_verified);
  const planLimit = currentPlan?.ad_limit ?? freeLimit;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      type: user.type,
      cnpj_verified: user.cnpj_verified,
    },
    current_plan: currentPlan
      ? {
          id: currentPlan.id,
          name: currentPlan.name,
          ad_limit: currentPlan.ad_limit,
          billing_model: currentPlan.billing_model,
        }
      : null,
    stats: {
      active_ads: activeAds.length,
      paused_ads: pausedAds.length,
      featured_ads: activeAds.filter((ad) => ad.is_featured).length,
      total_views: ads.reduce((sum, ad) => sum + toNumber(ad.views, 0), 0),
      free_limit: freeLimit,
      plan_limit: planLimit,
      available_limit: Math.max(planLimit - activeAds.length, 0),
      plan_name: currentPlan?.name ?? "Plano gratuito",
      is_verified_store: user.type === "CNPJ" ? user.cnpj_verified : false,
    },
    active_ads: activeAds,
    paused_ads: pausedAds,
    boost_options: BOOST_OPTIONS.map((option) => ({ ...option })),
  };
}

export async function validatePlanEligibility(userId) {
  const user = await getAccountUser(userId);
  const activeAds = await countActiveAdsByUser(userId);
  const currentPlan = await resolveCurrentPlan(user);
  const freeLimit = getFreeLimit(user.type, user.cnpj_verified);
  const planLimit = currentPlan?.ad_limit ?? freeLimit;

  if (user.type === "CNPJ" && !user.cnpj_verified) {
    return {
      allowed: false,
      reason: "CNPJ precisa estar verificado para publicar",
      suggested_plan_type: "CNPJ",
    };
  }

  if (activeAds < planLimit) {
    return {
      allowed: true,
      reason: currentPlan ? "Limite disponivel no plano atual" : "Limite gratuito disponivel",
      suggested_plan_type: null,
    };
  }

  return {
    allowed: false,
    reason:
      user.type === "CPF"
        ? "Limite de anuncios do plano atual atingido"
        : "Limite de anuncios da conta lojista atingido",
    suggested_plan_type: user.type,
  };
}

export function listBoostOptions() {
  return BOOST_OPTIONS.map((option) => ({ ...option }));
}

export async function updateOwnedAdStatus(userId, adId, action) {
  const owner = await adsRepository.findOwnerContextById(adId);
  const ownerIds = [owner?.user_id, owner?.advertiser_user_id]
    .filter(Boolean)
    .map((value) => String(value));

  if (!owner || !ownerIds.includes(String(userId))) {
    throw new AppError("Anuncio nao encontrado", 404);
  }

  const status = action === "pause" ? "paused" : "active";
  const updated = await adsRepository.updateAd(adId, { status });

  if (!updated) {
    throw new AppError("Falha ao atualizar anuncio", 500);
  }

  return getOwnedAd(userId, adId);
}

export async function deleteOwnedAd(userId, adId) {
  const owner = await adsRepository.findOwnerContextById(adId);
  const ownerIds = [owner?.user_id, owner?.advertiser_user_id]
    .filter(Boolean)
    .map((value) => String(value));

  if (!owner || !ownerIds.includes(String(userId))) {
    throw new AppError("Anuncio nao encontrado", 404);
  }

  const removed = await adsRepository.softDeleteAd(adId);
  if (!removed) {
    throw new AppError("Falha ao excluir anuncio", 500);
  }

  return { ok: true };
}
