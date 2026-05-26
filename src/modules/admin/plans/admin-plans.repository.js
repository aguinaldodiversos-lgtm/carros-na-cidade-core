import { query } from "../../../infrastructure/database/db.js";

/**
 * Lista todos os planos (active + inactive). Ordena por sort_order ASC,
 * priority_level ASC, name ASC. Inclui contagem de assinaturas ativas
 * em subquery — barato porque temos índice
 * user_subscriptions_user_active_idx (status, user_id) WHERE status IN
 * ('active','pending'). Mantém todos os campos auditáveis.
 *
 * SEM SELECT * por garantia explícita (regra da Fase 2).
 */
export async function list({ includeInactive = true } = {}) {
  const where = includeInactive ? "" : "WHERE p.is_active = true";
  const { rows } = await query(
    `SELECT
       p.id,
       p.name,
       p.type,
       p.price,
       p.ad_limit,
       p.is_featured_enabled,
       p.has_store_profile,
       p.priority_level,
       p.is_active,
       p.validity_days,
       p.billing_model,
       p.description,
       p.benefits,
       p.recommended,
       p.max_photos,
       p.weight,
       p.video_360_enabled,
       p.monthly_highlight_credits,
       p.sort_order,
       p.public_visible,
       p.created_at,
       p.updated_at,
       (SELECT COUNT(*)::int FROM user_subscriptions us
         WHERE us.plan_id = p.id AND us.status IN ('active','pending')
       ) AS active_subscriptions
     FROM subscription_plans p
     ${where}
     ORDER BY p.sort_order ASC, p.priority_level ASC, p.name ASC`
  );
  return rows;
}

export async function findById(id) {
  const { rows } = await query(
    `SELECT
       p.id, p.name, p.type, p.price, p.ad_limit,
       p.is_featured_enabled, p.has_store_profile, p.priority_level,
       p.is_active, p.validity_days, p.billing_model, p.description,
       p.benefits, p.recommended, p.max_photos, p.weight,
       p.video_360_enabled, p.monthly_highlight_credits,
       p.sort_order, p.public_visible,
       p.created_at, p.updated_at,
       (SELECT COUNT(*)::int FROM user_subscriptions us
         WHERE us.plan_id = p.id AND us.status IN ('active','pending')
       ) AS active_subscriptions
     FROM subscription_plans p
     WHERE p.id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * INSERT idempotente seria perigoso (admin pode criar 2 planos com
 * preços diferentes mesmo id) — usamos ON CONFLICT DO NOTHING e o
 * caller valida o id como único antes.
 */
export async function insert(plan) {
  const {
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
    recommended,
    max_photos,
    weight,
    video_360_enabled,
    monthly_highlight_credits,
    sort_order,
    public_visible,
  } = plan;

  const { rows } = await query(
    `INSERT INTO subscription_plans (
       id, name, type, price, ad_limit,
       is_featured_enabled, has_store_profile, priority_level,
       is_active, validity_days, billing_model, description,
       benefits, recommended, max_photos, weight,
       video_360_enabled, monthly_highlight_credits,
       sort_order, public_visible
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11, $12,
       $13::jsonb, $14, $15, $16,
       $17, $18,
       $19, $20
     )
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
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
      JSON.stringify(benefits || []),
      recommended,
      max_photos,
      weight,
      video_360_enabled,
      monthly_highlight_credits,
      sort_order,
      public_visible,
    ]
  );
  return rows[0] || null;
}

/**
 * UPDATE parcial — só atualiza campos que o caller passou.
 * Atualiza updated_at automaticamente. O caller já validou cada campo.
 *
 * `benefits` é tratado como JSONB explicitamente quando presente.
 */
export async function updatePartial(id, patch) {
  const sets = [];
  const params = [];
  let idx = 1;

  const fields = [
    "name",
    "type",
    "price",
    "ad_limit",
    "is_featured_enabled",
    "has_store_profile",
    "priority_level",
    "is_active",
    "validity_days",
    "billing_model",
    "description",
    "recommended",
    "max_photos",
    "weight",
    "video_360_enabled",
    "monthly_highlight_credits",
    "sort_order",
    "public_visible",
  ];

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      sets.push(`${field} = $${idx++}`);
      params.push(patch[field]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "benefits")) {
    sets.push(`benefits = $${idx++}::jsonb`);
    params.push(JSON.stringify(patch.benefits || []));
  }

  if (!sets.length) {
    return findById(id);
  }

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const { rows } = await query(
    `UPDATE subscription_plans SET ${sets.join(", ")}
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
}

/**
 * Lista assinaturas de um plano. Para a tela "Ver assinaturas" — não
 * expõe dados sensíveis (sem provider_preapproval_id, sem metadata).
 */
export async function listSubscriptions(planId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT
       us.user_id,
       us.plan_id,
       us.status,
       us.expires_at,
       us.current_period_start,
       us.current_period_end,
       us.created_at,
       us.updated_at,
       u.name  AS user_name,
       u.email AS user_email
     FROM user_subscriptions us
     LEFT JOIN users u ON u.id::text = us.user_id
     WHERE us.plan_id = $1
     ORDER BY us.created_at DESC
     LIMIT $2 OFFSET $3`,
    [planId, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM user_subscriptions WHERE plan_id = $1`,
    [planId]
  );

  return {
    data: rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

/**
 * Conta assinaturas ativas — usado para impedir deactivate sem aviso
 * e para gating de delete no service.
 */
export async function countActiveSubscriptions(planId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
     FROM user_subscriptions
     WHERE plan_id = $1 AND status IN ('active','pending')`,
    [planId]
  );
  return rows[0]?.total || 0;
}
