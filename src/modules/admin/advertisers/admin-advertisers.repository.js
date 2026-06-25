import { query, withTransaction } from "../../../infrastructure/database/db.js";
import { GRANT_SOURCE } from "./advertiser-plan-grant.constants.js";

export async function listAdvertisers({ limit = 50, offset = 0, status } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`adv.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       adv.id, adv.name, adv.email, adv.phone, adv.company_name,
       adv.status, adv.plan, adv.user_id, adv.city_id,
       adv.suspended_at, adv.blocked_at, adv.status_reason,
       adv.created_at, adv.updated_at,
       u.role AS user_role, u.document_type, u.email AS user_email,
       COUNT(a.id) FILTER (WHERE a.status = 'active') AS active_ads_count,
       COUNT(a.id) FILTER (WHERE a.status != 'deleted') AS total_ads_count
     FROM advertisers adv
     LEFT JOIN users u ON u.id = adv.user_id
     LEFT JOIN ads a ON a.advertiser_id = adv.id
     ${where}
     GROUP BY adv.id, u.id
     ORDER BY adv.created_at DESC NULLS LAST
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM advertisers adv ${where}`,
    params
  );

  return {
    data: result.rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

export async function findById(id) {
  const result = await query(
    `SELECT
       adv.*,
       u.role AS user_role, u.document_type, u.email AS user_email,
       u.name AS user_name, u.plan AS user_plan
     FROM advertisers adv
     LEFT JOIN users u ON u.id = adv.user_id
     WHERE adv.id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateStatus(id, status, reason = null) {
  if (status === "active") {
    const result = await query(
      `UPDATE advertisers
       SET status = $2, updated_at = NOW(),
           suspended_at = NULL, blocked_at = NULL, status_reason = NULL
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return result.rows[0] || null;
  }

  const timestampCol = status === "suspended" ? "suspended_at" : "blocked_at";
  const result = await query(
    `UPDATE advertisers
     SET status = $2, updated_at = NOW(),
         ${timestampCol} = NOW(), status_reason = $3
     WHERE id = $1 RETURNING *`,
    [id, status, reason]
  );
  return result.rows[0] || null;
}

export async function getAdvertiserAds(advertiserId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT
       a.id, a.title, a.slug, a.status, a.price, a.city, a.state,
       a.brand, a.model, a.year, a.priority, a.highlight_until,
       a.created_at, a.updated_at
     FROM ads a
     WHERE a.advertiser_id = $1
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [advertiserId, limit, offset]
  );
  return result.rows;
}

// ───────────────────────────────────────────────────────────────────────────
// Concessão MANUAL de plano (admin) — leituras + transações.
//
// Convenção: a fonte de verdade do plano efetivo é `users.plan_id` (lida por
// account.service.resolveCurrentPlan). As funções abaixo escrevem em
// user_subscriptions (ledger) E sincronizam users.plan_id, espelhando o
// fluxo pago do webhook do Mercado Pago (payments.service.js).
// ───────────────────────────────────────────────────────────────────────────

/** Plano consultado para validação de concessão (existência / ativo / tipo). */
export async function findPlanForGrant(planId) {
  const result = await query(
    `SELECT id, name, type, billing_model, is_active, validity_days,
            ad_limit, max_photos, priority_level
     FROM subscription_plans
     WHERE id = $1
     LIMIT 1`,
    [planId]
  );
  return result.rows[0] || null;
}

/** Plano efetivo atual (users.plan_id) + nome, para exibição e auditoria. */
export async function getEffectivePlan(userId) {
  const result = await query(
    `SELECT u.plan_id, u.document_type,
            p.name AS plan_name, p.billing_model
     FROM users u
     LEFT JOIN subscription_plans p ON p.id = u.plan_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

/** Concessão manual ATIVA do usuário (a mais recente), com plano + admin. */
export async function getActiveGrant(userId) {
  const result = await query(
    `SELECT us.user_id, us.plan_id, us.status, us.source,
            us.starts_at, us.expires_at, us.created_at,
            us.granted_by_admin_id, us.grant_reason_type, us.grant_reason_note,
            p.name AS plan_name, p.type AS plan_type, p.billing_model,
            admin_u.name AS granted_by_name, admin_u.email AS granted_by_email
     FROM user_subscriptions us
     LEFT JOIN subscription_plans p ON p.id = us.plan_id
     LEFT JOIN users admin_u ON admin_u.id = us.granted_by_admin_id
     WHERE us.user_id = $1
       AND us.source = $2
       AND us.status = 'active'
     ORDER BY us.created_at DESC
     LIMIT 1`,
    [userId, GRANT_SOURCE]
  );
  return result.rows[0] || null;
}

/**
 * Assinatura PAGA "viva" (Mercado Pago) ainda vigente. Usada para BLOQUEAR
 * a substituição silenciosa de um plano pago por uma concessão manual.
 * Identifica pago por payment_id/provider e source != admin_grant.
 */
export async function findLivePaidSubscription(userId) {
  const result = await query(
    `SELECT us.user_id, us.plan_id, us.status, us.expires_at,
            p.name AS plan_name
     FROM user_subscriptions us
     LEFT JOIN subscription_plans p ON p.id = us.plan_id
     WHERE us.user_id = $1
       AND COALESCE(us.source, '') <> $2
       AND (us.payment_id IS NOT NULL OR us.provider IS NOT NULL)
       AND us.status IN ('active', 'pending', 'paused')
       AND (us.expires_at IS NULL OR us.expires_at > NOW())
     ORDER BY us.created_at DESC
     LIMIT 1`,
    [userId, GRANT_SOURCE]
  );
  return result.rows[0] || null;
}

/**
 * Reverte users.plan_id quando uma concessão deixa de valer: aponta para a
 * assinatura paga viva (se houver) ou rebaixa para o gratuito do tipo de
 * documento. Mesma regra do branch "canceled" do webhook (payments.service).
 */
async function revertEffectivePlanInTx(client, userId) {
  const live = await client.query(
    `SELECT plan_id
     FROM user_subscriptions
     WHERE user_id = $1
       AND COALESCE(source, '') <> $2
       AND status IN ('active', 'pending', 'paused')
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, GRANT_SOURCE]
  );

  if (live.rows[0]) {
    await client.query(`UPDATE users SET plan_id = $2 WHERE id = $1`, [
      userId,
      live.rows[0].plan_id,
    ]);
    return live.rows[0].plan_id;
  }

  await client.query(
    `UPDATE users
     SET plan_id = CASE
       WHEN UPPER(COALESCE(document_type, '')) = 'CNPJ' THEN 'cnpj-free-store'
       ELSE 'cpf-free-essential'
     END
     WHERE id = $1`,
    [userId]
  );
  return null;
}

/**
 * Cria uma concessão manual em transação:
 *   1) encerra concessões manuais vivas anteriores (sem apagar histórico);
 *   2) insere a nova user_subscription (source=admin_grant, status=active);
 *   3) sincroniza users.plan_id (fonte de verdade dos benefícios).
 *
 * NÃO cria payment, NÃO chama Mercado Pago. payment_id fica NULL.
 */
export async function createGrant({
  userId,
  planId,
  status = "active",
  source = GRANT_SOURCE,
  startsAt,
  expiresAt,
  grantedByAdminId,
  reasonType,
  reasonNote,
  metadata = {},
}) {
  return withTransaction(async (client) => {
    // 1) Substitui concessões manuais ativas/pendentes anteriores.
    await client.query(
      `UPDATE user_subscriptions
       SET status = 'cancelled',
           cancelled_at = NOW(),
           expires_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND source = $2
         AND status IN ('active', 'pending', 'paused')`,
      [userId, GRANT_SOURCE]
    );

    // 2) Insere a nova concessão.
    const inserted = await client.query(
      `INSERT INTO user_subscriptions (
         user_id, plan_id, status, source,
         starts_at, expires_at,
         granted_by_admin_id, grant_reason_type, grant_reason_note,
         current_period_start, current_period_end,
         payment_id, metadata, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $5, $6, NULL, $10::jsonb, NOW())
       RETURNING user_id, plan_id, status, source, starts_at, expires_at,
                 granted_by_admin_id, grant_reason_type, grant_reason_note,
                 created_at`,
      [
        userId,
        planId,
        status,
        source,
        startsAt,
        expiresAt,
        grantedByAdminId,
        reasonType,
        reasonNote,
        JSON.stringify(metadata || {}),
      ]
    );

    // 3) Sincroniza o plano efetivo.
    await client.query(`UPDATE users SET plan_id = $2 WHERE id = $1`, [userId, planId]);

    return inserted.rows[0] || null;
  });
}

/**
 * Revoga a concessão manual ativa (admin clicou "Revogar") e reverte o plano
 * efetivo. Mantém a row como 'cancelled' (histórico preservado).
 */
export async function revokeGrant({ userId }) {
  return withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE user_subscriptions
       SET status = 'cancelled',
           cancelled_at = NOW(),
           expires_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1
         AND source = $2
         AND status = 'active'
       RETURNING plan_id`,
      [userId, GRANT_SOURCE]
    );

    const revertedTo = await revertEffectivePlanInTx(client, userId);
    return { revoked: updated.rows, reverted_to: revertedTo };
  });
}

/**
 * Sweep de expiração (lazy, idempotente). Marca como 'expired' as concessões
 * manuais ativas cujo expires_at já passou e, para cada usuário afetado cujo
 * plano efetivo ainda aponta para a concessão vencida, reverte users.plan_id.
 *
 * Escopo: por usuário (userId) ou global (userId=null, usado pelo script/cron).
 * Retorna as linhas vencidas [{ user_id, plan_id }].
 */
export async function expireDueGrants({ userId = null } = {}) {
  return withTransaction(async (client) => {
    const params = [GRANT_SOURCE];
    let userFilter = "";
    if (userId) {
      params.push(userId);
      userFilter = `AND user_id = $${params.length}`;
    }

    const due = await client.query(
      `SELECT user_id, plan_id
       FROM user_subscriptions
       WHERE source = $1
         AND status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
         ${userFilter}
       FOR UPDATE`,
      params
    );

    if (!due.rows.length) return [];

    await client.query(
      `UPDATE user_subscriptions
       SET status = 'expired', updated_at = NOW()
       WHERE source = $1
         AND status = 'active'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
         ${userFilter}`,
      params
    );

    const affectedUsers = [...new Set(due.rows.map((r) => r.user_id))];
    for (const uid of affectedUsers) {
      const expiredPlans = due.rows
        .filter((r) => r.user_id === uid)
        .map((r) => r.plan_id);
      const cur = await client.query(`SELECT plan_id FROM users WHERE id = $1`, [uid]);
      const currentPlan = cur.rows[0]?.plan_id || null;
      if (currentPlan && expiredPlans.includes(currentPlan)) {
        await revertEffectivePlanInTx(client, uid);
      }
    }

    return due.rows;
  });
}
