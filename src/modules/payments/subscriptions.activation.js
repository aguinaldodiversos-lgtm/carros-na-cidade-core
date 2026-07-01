/**
 * Ativação/renovação de assinatura recorrente (Fase 2).
 *
 * Chamada SÓ quando há authorized_payment APPROVED com valor real — o benefício
 * (users.plan_id) nunca é ligado pelo preapproval 'authorized' isolado.
 *
 * Idempotência DUPLA:
 *   - payments.mercado_pago_id UNIQUE → só um authorized_payment novo prossegue
 *     (reprocesso do MP não estende período nem reativa).
 *   - user_subscriptions.provider_preapproval_id UNIQUE (índice parcial) → uma
 *     linha por preapproval; reprocesso faz UPDATE, não INSERT.
 *
 * Preço travado por VÍNCULO ININTERRUPTO: contracted_amount/contracted_price_since
 * são gravados na 1ª ativação e PRESERVADOS na renovação. Uma nova assinatura
 * após cancelamento é um NOVO preapproval → nova linha (novo provider_preapproval_id)
 * → grava o preço vigente e zera o relógio; não herda a linha antiga.
 */

import { query, withTransaction } from "../../infrastructure/database/db.js";

const PROVIDER = "mercado_pago";
const ADMIN_GRANT_SOURCE = "admin_grant";

/** Resolve user+plano pela id do preapproval, via payment_intents (context='plan'). */
export async function findPlanIntentByPreapprovalId(preapprovalId) {
  const id = String(preapprovalId || "").trim();
  if (!id) return null;
  const result = await query(
    `
    SELECT id, user_id, plan_id
    FROM payment_intents
    WHERE checkout_resource_id = $1 AND context = 'plan'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Registra o authorized_payment aprovado e ATIVA/RENOVA a assinatura.
 * Idempotente pela UNIQUE de payments.mercado_pago_id: só pagamento novo
 * prossegue. NÃO re-checa is_active do plano (grandfathering).
 *
 * INTERVAL '1 month' está acoplado ao auto_recurring mensal do preapproval
 * (frequency:1, frequency_type:'months' em createPlanSubscription). Se surgir
 * plano anual, mudar OS DOIS juntos.
 */
export async function recordPaymentAndActivate({
  preapprovalId,
  userId,
  planId,
  authorizedPaymentId,
  amount,
}) {
  return withTransaction(async (client) => {
    // 1) Ledger de idempotência — só um authorized_payment novo prossegue.
    const ins = await client.query(
      `
      INSERT INTO payments (user_id, plan_id, mercado_pago_id, status, amount, payment_type)
      VALUES ($1, $2, $3, 'approved', $4, 'recurring')
      ON CONFLICT (mercado_pago_id) DO NOTHING
      RETURNING id
      `,
      [userId, planId, String(authorizedPaymentId), Number(amount)]
    );
    if (ins.rows.length === 0) {
      return { activated: false, reason: "duplicate_payment" };
    }

    // 2) Upsert da assinatura (idempotente por provider_preapproval_id).
    //    1ª ativação (INSERT): grava contracted_amount + contracted_price_since.
    //    Renovação (ON CONFLICT): estende período + last_payment_id, mas
    //    PRESERVA contracted_amount/contracted_price_since (preço travado).
    await client.query(
      `
      INSERT INTO user_subscriptions
        (user_id, plan_id, status, source, provider, provider_preapproval_id,
         starts_at, current_period_start, current_period_end, last_payment_id,
         contracted_amount, contracted_price_since, metadata, updated_at)
      VALUES ($1, $2, 'active', $3, $3, $4,
              NOW(), NOW(), NOW() + INTERVAL '1 month', $5,
              $6, NOW(), '{}'::jsonb, NOW())
      ON CONFLICT (provider_preapproval_id) WHERE provider_preapproval_id IS NOT NULL
      DO UPDATE SET
        status = 'active',
        current_period_end =
          GREATEST(COALESCE(user_subscriptions.current_period_end, NOW()), NOW())
          + INTERVAL '1 month',
        last_payment_id = EXCLUDED.last_payment_id,
        updated_at = NOW()
      `,
      [userId, planId, PROVIDER, String(preapprovalId), String(authorizedPaymentId), Number(amount)]
    );

    // 3) Fonte de verdade do plano efetivo — liga peso Pro/Start (grandfathering:
    //    não re-checa is_active; usa o plan_id do intent).
    await client.query(`UPDATE users SET plan_id = $2 WHERE id = $1`, [userId, planId]);

    // 4) Aposenta concessão de cortesia (admin_grant) ativa — a paga substitui.
    await client.query(
      `
      UPDATE user_subscriptions
      SET status = 'cancelled', cancelled_at = NOW(), expires_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND source = $2 AND status IN ('active', 'pending', 'paused')
      `,
      [userId, ADMIN_GRANT_SOURCE]
    );

    return { activated: true };
  });
}

/**
 * Persiste um authorized_payment APPROVED que não pôde ser resolvido/ativado
 * (intent inexistente ou valor ausente). É dinheiro confirmado sem benefício —
 * NÃO pode virar só log. Idempotente por authorized_payment_id UNIQUE.
 */
export async function recordUnresolvedApprovedPayment({
  authorizedPaymentId,
  preapprovalId = null,
  amount = null,
  reason,
  payload = {},
}) {
  await query(
    `
    INSERT INTO subscription_reconciliation
      (authorized_payment_id, provider_preapproval_id, amount, status, reason, payload)
    VALUES ($1, $2, $3, 'unresolved', $4, $5::jsonb)
    ON CONFLICT (authorized_payment_id) DO NOTHING
    `,
    [
      String(authorizedPaymentId),
      preapprovalId ? String(preapprovalId) : null,
      amount == null ? null : Number(amount),
      String(reason || "unknown"),
      JSON.stringify(payload || {}),
    ]
  );
}
