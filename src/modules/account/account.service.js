import { pool, withUserTransaction } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { isEventsDomainEnabled } from "../../shared/config/features.js";
import * as adsRepository from "../ads/ads.repository.js";
import * as adsPanelService from "../ads/ads.panel.service.js";
import { AD_STATUS } from "../ads/ads.canonical.constants.js";
import { getAccountUser } from "./account.user.read.js";

/**
 * IDs de planos atrelados ao produto Evento (dormente). Filtrados das
 * respostas públicas quando `EVENTS_PUBLIC_ENABLED !== "true"`.
 *
 * Mantemos a row no DB e em DEFAULT_PLANS — o filtro é só de exposição,
 * não delete. Reativar exige flag + revisão do runbook
 * `docs/runbooks/events-feature-shutdown.md`.
 */
const EVENT_PLAN_IDS = new Set(["cnpj-evento-premium"]);

export function isEventPlanId(planId) {
  return EVENT_PLAN_IDS.has(String(planId || "").trim().toLowerCase());
}

export { getAccountUser };

/**
 * Trava técnica do "ilimitado" do plano Pro. Banco/admin pode ajustar,
 * mas o fallback nunca devolve um número absurdo. Ver docs/runbooks/
 * plans-launch-alignment.md para política e UI.
 */
const PRO_PLAN_AD_LIMIT_GUARD = 1000;

/**
 * Catálogo público de planos — FALLBACK quando a query em
 * `subscription_plans` retorna vazio ou falha. Fonte de verdade real é
 * o banco/admin; aqui ficam os números OFICIAIS de lançamento alinhados
 * à oferta comercial:
 *
 *   Grátis CPF:  3 ads,  peso 1
 *   Grátis CNPJ: 10 ads, peso 1
 *   Start CNPJ:  20 ads, peso 2  — R$ 79,90/mês
 *   Pro CNPJ:    ilimitado (trava ${PRO_PLAN_AD_LIMIT_GUARD}), peso 3 — R$ 149,90/mês
 *
 * Boost avulso "Destaque 7 dias" (R$ 39,90, peso 4 enquanto ativo)
 * vive em BOOST_OPTIONS abaixo, não aqui.
 *
 * Planos descontinuados (`cpf-premium-highlight`, `cnpj-evento-premium`)
 * permanecem no array com `is_active=false` — preserva resolução por id
 * mas omite no `listPlans({ onlyActive: true })`. Banco continua tendo
 * as rows; remoção definitiva é decisão de runbook separado
 * (docs/runbooks/plans-launch-alignment.md).
 *
 * Campos `max_photos`, `weight`, `video_360_enabled`, `monthly_highlight_credits`
 * ainda não têm coluna no banco. Frontend já consome quando vêm; backend
 * devolve no fallback. Migration documentada no runbook.
 */
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
      "Ate 8 fotos por anuncio",
      "Contato direto via WhatsApp",
      "Sem comissao por venda",
    ],
    max_photos: 8,
    weight: 1,
    video_360_enabled: false,
    monthly_highlight_credits: 0,
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
    // Descontinuado na oferta de lançamento: substituído pelo boost avulso
    // boost-7d (R$ 39,90), válido para CPF e CNPJ. Mantido com is_active=false
    // para preservar lookup histórico (subscription antiga de 30 dias).
    is_active: false,
    validity_days: 30,
    billing_model: "one_time",
    description: "Destaque no topo da busca com mais visibilidade para vender mais rapido.",
    benefits: [
      "Destaque no topo da busca",
      "Badge premium no anuncio",
      "Prioridade de exibicao por 30 dias",
    ],
    max_photos: 8,
    weight: 1,
    video_360_enabled: false,
    monthly_highlight_credits: 0,
    recommended: false,
  },
  {
    id: "cnpj-free-store",
    name: "Plano Gratuito Loja",
    type: "CNPJ",
    price: 0,
    ad_limit: 10,
    is_featured_enabled: false,
    has_store_profile: true,
    priority_level: 5,
    is_active: true,
    validity_days: null,
    billing_model: "free",
    description: "Para lojas com CNPJ verificado iniciarem no portal sem mensalidade.",
    benefits: [
      "Ate 10 anuncios ativos",
      "Ate 8 fotos por anuncio",
      "Perfil de loja ativo",
      "Sem comissao nas vendas",
    ],
    max_photos: 8,
    weight: 1,
    video_360_enabled: false,
    monthly_highlight_credits: 0,
    recommended: false,
  },
  {
    id: "cnpj-store-start",
    name: "Plano Loja Start",
    type: "CNPJ",
    price: 79.9,
    ad_limit: 20,
    is_featured_enabled: true,
    has_store_profile: true,
    priority_level: 60,
    is_active: true,
    validity_days: 30,
    billing_model: "monthly",
    description: "Plano de entrada para escalar anuncios da loja com destaque opcional.",
    benefits: [
      "Ate 20 anuncios ativos",
      "Ate 12 fotos por anuncio",
      "1 destaque mensal incluido",
      "Perfil de loja personalizado",
    ],
    max_photos: 12,
    weight: 2,
    video_360_enabled: false,
    monthly_highlight_credits: 1,
    recommended: false,
  },
  {
    id: "cnpj-store-pro",
    name: "Plano Loja Pro",
    type: "CNPJ",
    price: 149.9,
    ad_limit: PRO_PLAN_AD_LIMIT_GUARD,
    is_featured_enabled: true,
    has_store_profile: true,
    priority_level: 80,
    is_active: true,
    validity_days: 30,
    billing_model: "monthly",
    description: "Anuncios sem limite pratico, destaques mensais inclusos e video 360.",
    benefits: [
      "Anuncios ilimitados (trava tecnica configuravel pelo admin)",
      "Ate 15 fotos por anuncio",
      "3 destaques mensais inclusos",
      "Video 360 habilitado",
      "Dashboard de performance por cidade",
    ],
    max_photos: 15,
    weight: 3,
    video_360_enabled: true,
    monthly_highlight_credits: 3,
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
    // Produto Evento desligado por feature flag. is_active=false no
    // fallback como defesa em profundidade: se banco devolver vazio,
    // listPlans não exibe Evento. Filtro adicional via isEventPlanId() +
    // EVENTS_PUBLIC_ENABLED já removia da resposta pública.
    is_active: false,
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

/**
 * Lê `users.plan_id` (coluna canônica criada na migration 020) — fonte de
 * verdade preferencial para o plano atual. Retorna null se a coluna não
 * existir (banco legado pré-020) ou se o usuário ainda não tiver plan_id.
 */
async function getPlanIdFromUsersColumn(userId) {
  try {
    const userColumns = await getTableColumns("users");
    if (!hasColumn(userColumns, "plan_id")) {
      return null;
    }

    const result = await pool.query(
      `SELECT plan_id FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    return result.rows[0]?.plan_id ? String(result.rows[0].plan_id) : null;
  } catch {
    return null;
  }
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

/**
 * Conta anúncios ativos do usuário (status='active', via JOIN advertisers).
 *
 * Reexportado em 2026-05-06 porque `ads.publication-options.service.js`
 * (Fase 4) importa este named export para compor o payload `ad_limit`. O
 * service já usava a função internamente em `resolvePublishEligibility`;
 * a falta da palavra-chave `export` quebrou o boot do backend no Render
 * com `SyntaxError: ... does not provide an export named 'countActiveAdsByUser'`.
 * Os testes da publication-options mockam o módulo inteiro com vi.mock,
 * o que mascara a checagem de named exports do ESM — daí o boot só
 * quebrar em produção.
 */
export async function countActiveAdsByUser(userId) {
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE a.status = '${AD_STATUS.ACTIVE}'
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
        AND a.status != '${AD_STATUS.DELETED}'
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

  // Filtro de produto Evento (dormente) — quando EVENTS_PUBLIC_ENABLED
  // não está em "true" exato, planos atrelados ao produto Evento NÃO
  // aparecem na resposta pública. Frontend `/planos` consome este
  // endpoint e simplesmente não renderiza o card. Zero alteração de
  // layout/componentes necessária. Re-ativar = flag em "true".
  const eventsPublic = isEventsDomainEnabled("public");

  return plans
    .filter((plan) => (type ? plan.type === normalizeAccountType(type) : true))
    .filter((plan) => (onlyActive ? plan.is_active : true))
    .filter((plan) => (eventsPublic ? true : !isEventPlanId(plan.id)));
}

export async function getPlanById(planId) {
  const plans = await listPlans({ onlyActive: false });
  return plans.find((plan) => plan.id === planId) ?? null;
}

/**
 * Resolve o plano corrente do usuário (free → paid → último ativo).
 * Reexportado em 2026-05-06 pelo mesmo motivo de `countActiveAdsByUser`:
 * `ads.publication-options.service.js` importa este símbolo como named
 * export e o boot do backend quebra no Render se faltar `export`.
 */
export async function resolveCurrentPlan(user) {
  const planType = user.type === "pending" ? "CPF" : user.type;
  const plans = await listPlans({ type: planType, onlyActive: false });

  // Prioridade: users.plan_id (canônico, atualizado pelo webhook + backfill da
  // migration 020) > user_subscriptions.active > resolveLegacyPlanAlias (fallback
  // para bancos legados ainda não migrados ou usuários sem plano explícito).
  const planIdFromUsersColumn = await getPlanIdFromUsersColumn(user.id);
  const planIdFromSubscription = planIdFromUsersColumn
    ? null
    : await getCurrentPlanIdFromDatabase(user.id);
  const hasHistory =
    planIdFromUsersColumn || planIdFromSubscription
      ? false
      : await hasSubscriptionHistory(user.id);

  const preferredId =
    planIdFromUsersColumn ||
    planIdFromSubscription ||
    (hasHistory
      ? resolveLegacyPlanAlias("free", planType)
      : resolveLegacyPlanAlias(user.raw_plan, planType));

  return (
    plans.find((plan) => plan.id === preferredId) ??
    plans.find((plan) => plan.billing_model === "free") ??
    null
  );
}

function getFreeLimit(accountType, cnpjVerified) {
  if (accountType === "pending" || accountType === "CPF") return 3;
  return cnpjVerified ? 20 : 0;
}

function primaryImageUrlFromAdRow(row) {
  const direct = row?.image_url != null ? String(row.image_url).trim() : "";
  if (direct) return direct;

  const raw = row?.images;
  if (Array.isArray(raw)) {
    const u = raw.find((x) => typeof x === "string" && x.trim());
    return u ? u.trim() : "";
  }
  if (raw && typeof raw === "object") {
    try {
      const arr = Array.isArray(raw) ? raw : null;
      if (arr?.length) {
        const u = arr.find((x) => typeof x === "string" && x.trim());
        if (u) return u.trim();
      }
    } catch {
      // ignore
    }
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "string") {
        return parsed[0].trim();
      }
    } catch {
      // ignore
    }
  }
  return "";
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

  const imageUrl = primaryImageUrlFromAdRow(row) || "/images/vehicle-placeholder.svg";

  // Status passa direto para o dashboard — frontend renderiza o badge
  // correspondente (Em análise / Rejeitado / Pausado / Ativo / etc.).
  // Defesa: se vier algum status desconhecido (legado), cai em ACTIVE
  // para o frontend não renderizar string crua.
  const KNOWN_DASHBOARD_STATUSES = [
    AD_STATUS.ACTIVE,
    AD_STATUS.PAUSED,
    AD_STATUS.PENDING_REVIEW,
    AD_STATUS.REJECTED,
    AD_STATUS.SOLD,
    AD_STATUS.EXPIRED,
    AD_STATUS.BLOCKED,
  ];
  const dashboardStatus = KNOWN_DASHBOARD_STATUSES.includes(row.status)
    ? row.status
    : AD_STATUS.ACTIVE;

  return {
    id: String(row.id),
    user_id: String(
      row.owner_user_id ?? row.user_id ?? row.advertiser_user_id ?? row.owner_id ?? ""
    ),
    title: row.title?.trim() || "Anuncio sem titulo",
    price: toNumber(row.price, 0),
    image_url: imageUrl,
    status: dashboardStatus,
    is_featured: isFeatured,
    featured_until: featuredUntil,
    priority_level: isFeatured ? "high" : "normal",
    views: toNumber(row.views, 0),
    expires_at: fallbackExpiry.toISOString(),
    // Motivos exibíveis no card (quando aplicável). Frontend só mostra se vier.
    moderation: {
      rejection_reason: row.rejection_reason || null,
      correction_requested_reason: row.correction_requested_reason || null,
    },
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
        a.updated_at,
        a.images,
        a.rejection_reason,
        a.correction_requested_reason
      FROM ads a
      JOIN advertisers adv ON adv.id = a.advertiser_id
      WHERE a.status IN (
        '${AD_STATUS.ACTIVE}',
        '${AD_STATUS.PAUSED}',
        '${AD_STATUS.PENDING_REVIEW}',
        '${AD_STATUS.REJECTED}',
        '${AD_STATUS.SOLD}',
        '${AD_STATUS.EXPIRED}'
      )
        AND adv.user_id = $1
      ORDER BY
        CASE WHEN a.status = '${AD_STATUS.ACTIVE}' THEN 0
             WHEN a.status = '${AD_STATUS.PENDING_REVIEW}' THEN 1
             WHEN a.status = '${AD_STATUS.PAUSED}' THEN 2
             WHEN a.status = '${AD_STATUS.REJECTED}' THEN 3
             ELSE 4 END,
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
      a.updated_at,
      a.images
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
      AND a.status != '${AD_STATUS.DELETED}'
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
  const fallbackAccountType =
    options.accountType === "CNPJ" ? "CNPJ" : options.accountType === "pending" ? "pending" : "CPF";

  try {
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
      accountType: user.type === "CNPJ" ? "PJ" : user.type === "CPF" ? "PF" : null,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        type: user.type,
        cnpj_verified: user.cnpj_verified,
        document_verified: user.document_verified,
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

    const freeLimit = getFreeLimit(
      fallbackAccountType === "pending"
        ? "pending"
        : fallbackAccountType === "CNPJ"
          ? "CNPJ"
          : "CPF",
      false
    );

    return {
      ok: true,
      accountType:
        fallbackAccountType === "CNPJ" ? "PJ" : fallbackAccountType === "pending" ? null : "PF",
      user: {
        id: uid,
        name: "Usuario",
        email: "",
        type: fallbackAccountType,
        cnpj_verified: false,
        document_verified: fallbackAccountType !== "pending",
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

  if (user.type === "pending") {
    return {
      allowed: false,
      reason: "Complete seu perfil com CPF ou CNPJ para publicar anúncios.",
      suggested_plan_type: null,
    };
  }

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

  // Status-guard: DELETED e BLOCKED têm fluxos próprios (admin/recovery)
  // e nunca podem virar ACTIVE/PAUSED por chamada do dono. Defesa contra
  // ressurreição/desbloqueio via PATCH activate (Fase 4 — tela pós-revisão
  // chama este endpoint como CTA de "Publicar grátis").
  const currentStatus = String(owner.status || "");
  if (currentStatus === AD_STATUS.DELETED || currentStatus === AD_STATUS.BLOCKED) {
    throw new AppError(
      `Anuncio em status '${currentStatus}' nao admite alteracao por este endpoint.`,
      410
    );
  }

  // Eligibility-guard: ao reativar um anúncio pausado, aplicar a mesma
  // fonte única de elegibilidade que o pipeline de criação. Defesa contra
  // bypass do limite de plano / CPF não verificado / CNPJ não verificado
  // via "pausar+reativar". Ignorado quando o ad já está active (idempotente,
  // sem efeito incremental no contador).
  if (action === "activate" && currentStatus !== AD_STATUS.ACTIVE) {
    const eligibility = await resolvePublishEligibility(userId);
    if (!eligibility.allowed) {
      throw new AppError(
        eligibility.reason || "Publicacao nao permitida no momento.",
        403
      );
    }
  }

  const status = action === "pause" ? AD_STATUS.PAUSED : AD_STATUS.ACTIVE;

  // withUserTransaction sets app.current_user_id so the RLS write policy
  // on ads can verify the owner at the database level (second defence layer).
  const updated = await withUserTransaction(String(userId), async (tx) => {
    const { rows } = await tx.query(
      `UPDATE ads SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [status, adId]
    );
    return rows[0] || null;
  });

  if (!updated) {
    throw new AppError("Falha ao atualizar anuncio", 500);
  }

  return getOwnedAd(userId, adId);
}

/**
 * Soft-delete unificado: delega para `adsPanelService.removeAd`, que é a
 * fonte única — faz `assertOwner` (mesma regra deste fluxo) + soft-delete
 * com `AD_STATUS.DELETED` + cleanup das imagens em R2 e da tabela
 * `vehicle_images`.
 *
 * Antes desta unificação, esta função apenas atualizava `ads.status`,
 * deixando objetos em R2 órfãos quando o usuário deletava pelo dashboard.
 * Ambas as portas (`DELETE /api/ads/:id` e `DELETE /api/account/ads/:id`)
 * agora chegam exatamente no mesmo caminho.
 */
export async function deleteOwnedAd(userId, adId) {
  try {
    await adsPanelService.removeAd(adId, { id: userId });
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError("Falha ao excluir anuncio", 500);
  }
}
