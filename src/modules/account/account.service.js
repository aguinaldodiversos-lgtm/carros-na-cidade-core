import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import * as adsRepository from "../ads/ads.repository.js";
import { ensureAdvertiserForUser } from "../advertisers/advertiser.ensure.service.js";
import { getAccountUser } from "./account.user.read.js";

export { getAccountUser };

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
    benefits: [
      "Ate 3 anuncios ativos por CPF",
      "Contato direto via WhatsApp",
      "Sem comissao por venda",
    ],
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
    benefits: [
      "Banner promocional na home regional",
      "Impulsionamento geolocalizado",
      "Ate 350 anuncios ativos",
    ],
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

const columnCache = new Map();

/**
 * Fonte única para PF vs CNPJ em conta (alinhado a auth `/me` e verify-document).
 * Aceita `cnpj`/`cpf` em qualquer caixa (como gravado em `users.document_type`).
 */
function normalizeAccountType(input) {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  return raw === "cnpj" ? "CNPJ" : "CPF";
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

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function mapPlanRow(row) {
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
    validity_days:
      row.validity_days === null || row.validity_days === undefined
        ? null
        : toNumber(row.validity_days, 0),
    billing_model: row.billing_model || "free",
    description: String(row.description || ""),
    benefits: safeJsonArray(row.benefits),
    recommended: Boolean(row.recommended),
  };
}

function toIsoStringOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getTableColumns(tableName) {
  const normalizedTable = String(tableName || "")
    .trim()
    .toLowerCase();
  if (!normalizedTable) return new Set();

  if (columnCache.has(normalizedTable)) {
    return columnCache.get(normalizedTable);
  }

  try {
    const result = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
      `,
      [normalizedTable]
    );

    const columns = new Set(result.rows.map((row) => row.column_name));
    columnCache.set(normalizedTable, columns);
    return columns;
  } catch {
    const empty = new Set();
    columnCache.set(normalizedTable, empty);
    return empty;
  }
}

function hasColumn(columns, columnName) {
  return columns.has(columnName);
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new AppError("Identificador SQL invalido", 500);
  }
  return `"${identifier}"`;
}

async function resolveSubscriptionUserColumn() {
  const columns = await getTableColumns("user_subscriptions");
  const candidates = ["user_id", "account_user_id", "subscriber_user_id"];

  for (const candidate of candidates) {
    if (hasColumn(columns, candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveSubscriptionPlanColumn() {
  const columns = await getTableColumns("user_subscriptions");
  const candidates = ["plan_id", "subscription_plan_id"];

  for (const candidate of candidates) {
    if (hasColumn(columns, candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveSubscriptionStatusColumn() {
  const columns = await getTableColumns("user_subscriptions");
  return hasColumn(columns, "status") ? "status" : null;
}

async function resolveSubscriptionCreatedAtColumn() {
  const columns = await getTableColumns("user_subscriptions");
  if (hasColumn(columns, "created_at")) return "created_at";
  if (hasColumn(columns, "updated_at")) return "updated_at";
  return null;
}

async function resolveSubscriptionExpiresAtColumn() {
  const columns = await getTableColumns("user_subscriptions");
  if (hasColumn(columns, "expires_at")) return "expires_at";
  if (hasColumn(columns, "current_period_end")) return "current_period_end";
  return null;
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
  const normalized = String(planValue || "")
    .trim()
    .toLowerCase();

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
    const userColumn = await resolveSubscriptionUserColumn();
    const planColumn = await resolveSubscriptionPlanColumn();
    const statusColumn = await resolveSubscriptionStatusColumn();
    const expiresAtColumn = await resolveSubscriptionExpiresAtColumn();
    const createdAtColumn = await resolveSubscriptionCreatedAtColumn();

    if (!userColumn || !planColumn) {
      return null;
    }

    const whereClauses = [`us.${quoteIdentifier(userColumn)} = $1`];

    if (statusColumn) {
      whereClauses.push(`us.${quoteIdentifier(statusColumn)} = 'active'`);
    }

    if (expiresAtColumn) {
      whereClauses.push(
        `(us.${quoteIdentifier(expiresAtColumn)} IS NULL OR us.${quoteIdentifier(expiresAtColumn)} > NOW())`
      );
    }

    const orderByClause = createdAtColumn
      ? `ORDER BY us.${quoteIdentifier(createdAtColumn)} DESC`
      : "";

    const result = await pool.query(
      `
      SELECT us.${quoteIdentifier(planColumn)} AS plan_id
      FROM user_subscriptions us
      WHERE ${whereClauses.join(" AND ")}
      ${orderByClause}
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
    const userColumn = await resolveSubscriptionUserColumn();
    if (!userColumn) return false;

    const result = await pool.query(
      `
      SELECT 1
      FROM user_subscriptions
      WHERE ${quoteIdentifier(userColumn)} = $1
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
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE a.status = 'active'
        AND adv.user_id = $1
      `,
      [userId]
    );

    return toNumber(result.rows[0]?.total, 0);
  } catch {
    return 0;
  }
}

/** Total de anúncios não excluídos (regra “primeiro anúncio” / documento). */
export async function countNonDeletedAdsForUser(userId) {
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE adv.user_id = $1
        AND a.status != 'deleted'
      `,
      [userId]
    );

    return toNumber(result.rows[0]?.total, 0);
  } catch {
    return 0;
  }
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
  const featuredUntil = toIsoStringOrNull(row.highlight_until);
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
  const fallbackExpiry = new Date(
    Math.max(createdAt.getTime(), updatedAt.getTime()) + 30 * 24 * 60 * 60 * 1000
  );

  const featuredUntilMs = featuredUntil ? new Date(featuredUntil).getTime() : null;

  const isFeatured =
    typeof featuredUntilMs === "number" &&
    !Number.isNaN(featuredUntilMs) &&
    featuredUntilMs > Date.now();

  return {
    id: String(row.id),
    user_id: String(
      row.owner_user_id ?? row.user_id ?? row.advertiser_user_id ?? row.owner_id ?? ""
    ),
    title: row.title?.trim() || "Anuncio sem titulo",
    price: toNumber(row.price, 0),
    image_url: row.image_url || "/images/banner1.jpg",
    status: row.status === "paused" ? "paused" : "active",
    is_featured: isFeatured,
    featured_until: featuredUntil,
    priority_level: isFeatured ? "high" : "normal",
    views: toNumber(row.views, 0),
    expires_at: fallbackExpiry.toISOString(),
  };
}

export async function listOwnedAds(userId) {
  try {
    const result = await pool.query(
      `
      SELECT
        a.id,
        adv.user_id AS owner_user_id,
        a.title,
        a.price,
        a.status,
        a.highlight_until,
        a.created_at,
        a.updated_at
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE a.status IN ('active', 'paused')
        AND adv.user_id = $1
      ORDER BY
        CASE WHEN a.status = 'active' THEN 0 ELSE 1 END,
        a.updated_at DESC NULLS LAST,
        a.created_at DESC NULLS LAST
      `,
      [userId]
    );

    return result.rows.map(normalizeDashboardAd);
  } catch {
    return [];
  }
}

export async function getOwnedAd(userId, adId) {
  const result = await pool.query(
    `
    SELECT
      a.id,
      adv.user_id AS owner_user_id,
      a.title,
      a.price,
      a.status,
      a.highlight_until,
      a.created_at,
      a.updated_at
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
      AND a.status != 'deleted'
      AND adv.user_id = $2
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

/**
 * @param {string} userId
 * @param {{ accountType?: 'CPF' | 'CNPJ' }} [options] — tipo da conta (JWT/DB) para fallback seguro se a montagem falhar
 */
export async function getDashboardPayload(userId, options = {}) {
  const uid = String(userId);
  const emptyBoost = BOOST_OPTIONS.map((option) => ({ ...option }));
  const fallbackAccountType = options.accountType === "CNPJ" ? "CNPJ" : "CPF";

  try {
    try {
      await ensureAdvertiserForUser(uid, { source: "dashboard" });
    } catch (err) {
      logger.warn(
        {
          err: err?.message || String(err),
          userId: uid,
          code: err?.code,
        },
        "[account.dashboard] ensureAdvertiserForUser falhou — seguindo com painel (anúncios podem estar vazios)"
      );
    }

    const user = await getAccountUser(userId);
    const [ads, publishEligibility] = await Promise.all([
      listOwnedAds(userId),
      resolvePublishEligibility(userId, user),
    ]);

    const activeAds = ads.filter((ad) => ad.status === "active");
    const pausedAds = ads.filter((ad) => ad.status === "paused");
    const currentPlan = await resolveCurrentPlan(user);
    const freeLimit = getFreeLimit(user.type, user.cnpj_verified);
    const planLimit = currentPlan?.ad_limit ?? freeLimit;

    const stats = {
      active_ads: activeAds.length,
      paused_ads: pausedAds.length,
      featured_ads: activeAds.filter((ad) => ad.is_featured).length,
      total_views: ads.reduce((sum, ad) => sum + toNumber(ad.views, 0), 0),
      free_limit: freeLimit,
      plan_limit: planLimit,
      available_limit: Math.max(planLimit - activeAds.length, 0),
      plan_name: currentPlan?.name ?? "Plano gratuito",
      is_verified_store: user.type === "CNPJ" ? user.cnpj_verified : false,
    };

    return {
      ok: true,
      accountType: user.type === "CNPJ" ? "PJ" : "PF",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        type: user.type,
        cnpj_verified: user.cnpj_verified,
      },
      advertiser: null,
      current_plan: currentPlan
        ? {
            id: currentPlan.id,
            name: currentPlan.name,
            ad_limit: currentPlan.ad_limit,
            billing_model: currentPlan.billing_model,
          }
        : null,
      plan: currentPlan
        ? {
            id: currentPlan.id,
            name: currentPlan.name,
            ad_limit: currentPlan.ad_limit,
            billing_model: currentPlan.billing_model,
          }
        : null,
      stats,
      metrics: {
        activeAds: stats.active_ads,
        highlightedAds: stats.featured_ads,
        views: stats.total_views,
        leads: 0,
      },
      publish_eligibility: {
        allowed: publishEligibility.allowed,
        reason: publishEligibility.reason,
      },
      active_ads: activeAds,
      paused_ads: pausedAds,
      recentAds: [...activeAds, ...pausedAds].slice(0, 12),
      alerts: [],
      boost_options: emptyBoost,
    };
  } catch (err) {
    logger.error(
      {
        err: err?.message || String(err),
        userId: uid,
        code: err?.code,
      },
      "[account.dashboard] getDashboardPayload falhou — retornando painel minimo"
    );

    const freeLimit = getFreeLimit(fallbackAccountType, false);

    return {
      ok: true,
      accountType: fallbackAccountType === "CNPJ" ? "PJ" : "PF",
      user: {
        id: uid,
        name: "Usuario",
        email: "",
        type: fallbackAccountType,
        cnpj_verified: false,
      },
      advertiser: null,
      current_plan: null,
      plan: null,
      stats: {
        active_ads: 0,
        paused_ads: 0,
        featured_ads: 0,
        total_views: 0,
        free_limit: freeLimit,
        plan_limit: freeLimit,
        available_limit: freeLimit,
        plan_name: "Plano gratuito",
        is_verified_store: false,
      },
      metrics: {
        activeAds: 0,
        highlightedAds: 0,
        views: 0,
        leads: 0,
      },
      publish_eligibility: {
        allowed: false,
        reason: "Nao foi possivel carregar os dados da conta agora. Tente novamente.",
      },
      active_ads: [],
      paused_ads: [],
      recentAds: [],
      alerts: [],
      boost_options: emptyBoost,
    };
  }
}

/**
 * Fonte única de elegibilidade para publicar anúncio (PF/PJ):
 * - CNPJ: documento verificado obrigatório
 * - CPF: com zero anúncios não excluídos, CPF deve estar verificado
 * - Limite: compara anúncios ativos ao teto do plano (mesma métrica que o painel usa em available_limit)
 *
 * Usado por: POST /account/plans/eligibility, pipeline de criação de anúncio, payload do dashboard.
 *
 * @param {object|null} [preloadedUser] — conta já carregada (evita query duplicada)
 * @returns {Promise<{ allowed: boolean, reason: string|null, suggested_plan_type: string|null }>}
 */
export async function resolvePublishEligibility(userId, preloadedUser = null) {
  const user = preloadedUser ?? (await getAccountUser(userId));
  const activeAds = await countActiveAdsByUser(userId);
  const totalNonDeleted = await countNonDeletedAdsForUser(userId);
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

  if (user.type === "CPF" && totalNonDeleted === 0 && !user.document_verified) {
    return {
      allowed: false,
      reason: "Para anunciar, é necessário verificar o CPF.",
      suggested_plan_type: "CPF",
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

/** @deprecated Use o nome `resolvePublishEligibility` (mesma implementação). */
export async function validatePlanEligibility(userId, preloadedUser = null) {
  return resolvePublishEligibility(userId, preloadedUser);
}

export function listBoostOptions() {
  return BOOST_OPTIONS.map((option) => ({ ...option }));
}

export async function updateOwnedAdStatus(userId, adId, action) {
  const owner = await adsRepository.findOwnerContextById(adId);
  const ownerIds = [owner?.advertiser_user_id].filter(Boolean).map((value) => String(value));

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
  const ownerIds = [owner?.advertiser_user_id].filter(Boolean).map((value) => String(value));

  if (!owner || !ownerIds.includes(String(userId))) {
    throw new AppError("Anuncio nao encontrado", 404);
  }

  const removed = await adsRepository.softDeleteAd(adId);
  if (!removed) {
    throw new AppError("Falha ao excluir anuncio", 500);
  }

  return { ok: true };
}
