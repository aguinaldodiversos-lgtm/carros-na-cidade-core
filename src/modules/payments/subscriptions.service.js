/**
 * Service de assinaturas recorrentes (Fase 3C).
 *
 * Camada FINA acima de createPlanSubscription/cancelPreapproval. Sua
 * responsabilidade é APLICAR os guards comerciais antes de tocar o
 * Mercado Pago:
 *
 *   - Plano deve ser cnpj-store-start ou cnpj-store-pro EXATOS
 *     (não aceita Evento Premium nem CPF Premium Highlight)
 *   - Preço vem do banco/fallback DEFAULT_PLANS — nunca do client
 *   - User não pode ter outra assinatura active/pending nesse momento
 *   - Ownership na hora do cancel: user só cancela sua própria sub
 *
 * createPlanSubscription (payments.service.js) continua existindo
 * para o endpoint legacy /api/payments/subscription. Esta camada é
 * a NOVA fonte que será chamada pelo /api/payments/subscriptions/*.
 */

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { query, withTransaction } from "../../infrastructure/database/db.js";
import {
  cancelPreapproval,
  mapPreapprovalStatusToLocal,
} from "./mercadopago-subscription.client.js";
import { createPlanSubscription } from "./payments.service.js";
import {
  assertNoLiveSubscriptionFor,
  assertSubscribablePlan,
  findLiveSubscriptionForUser,
} from "./subscriptions.guards.js";

// Re-exporta para compat retroativa (consumidores importavam daqui).
export { assertNoLiveSubscriptionFor, assertSubscribablePlan, findLiveSubscriptionForUser };

/**
 * Cria checkout de assinatura mensal Start ou Pro.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.planId — DEVE ser cnpj-store-start ou cnpj-store-pro
 * @param {string} opts.successUrl
 * @param {string} [opts.failureUrl]
 * @param {string} [opts.pendingUrl]
 * @param {string} [opts.requestId]
 *
 * @returns payload com `init_point`, `mercado_pago_id`, `local_intent_id`
 *   e `plan_id`. NÃO inclui local_subscription_id porque a row em
 *   user_subscriptions só é criada quando o webhook confirma autorização
 *   (`local_intent_id` rastreia o intent até lá).
 */
export async function createSubscriptionCheckout({
  userId,
  planId,
  successUrl,
  failureUrl,
  pendingUrl,
  requestId,
}) {
  const id = String(planId || "").trim();

  // Bloqueio de duplicata cedo (defesa em profundidade). A elegibilidade
  // data-driven (existe + is_active + subscribable + mensal) + o bloqueio de
  // Evento (410) são aplicados dentro de createPlanSubscription — choke point
  // único. Delegar garante simetria entre esta rota e a legacy /subscription.
  await assertNoLiveSubscriptionFor(userId);

  const result = await createPlanSubscription({
    userId,
    planId: id,
    successUrl,
    failureUrl,
    pendingUrl,
    requestId,
  });

  logger.info(
    {
      domain: "subscriptions.checkout",
      action: "create",
      userId,
      planId: id,
      mercadoPagoId: result.mercado_pago_id,
    },
    "[subscriptions] checkout criado"
  );

  return {
    ...result,
    // Alias semântico para o consumidor da Fase 3C entender que isto
    // representa a "intenção" de assinar — antes da confirmação do MP.
    local_intent_id: result.mercado_pago_id,
  };
}

/**
 * Cancela uma assinatura ativa do user. Política conservadora: marca
 * cancel_at_period_end=true (acesso continua até current_period_end)
 * E manda PUT cancelled no MP — para parar futuras cobranças.
 *
 * Se o usuário não tiver sub viva, retorna 404. Não tenta inferir
 * cancellation por outras vias.
 */
export async function cancelUserSubscription({ userId, requestId }) {
  const sub = await findLiveSubscriptionForUser(userId);
  if (!sub) {
    throw new AppError("Nenhuma assinatura ativa encontrada.", 404);
  }

  // Identificador no MP: prioriza coluna canônica (Fase 3C), fallback
  // para `payment_id` (legado da migration 020).
  const mpRef = sub.provider_preapproval_id || sub.payment_id;
  if (!mpRef) {
    throw new AppError(
      "Assinatura sem identificador Mercado Pago — cancele manualmente no painel admin.",
      500
    );
  }

  let mpResult = null;
  try {
    mpResult = await cancelPreapproval(mpRef);
  } catch (err) {
    // MP fora do ar: NÃO marcar cancelled localmente sem confirmação.
    // Lojista precisa reportar — admin manual pode forçar via SQL.
    logger.error(
      {
        domain: "subscriptions.cancel",
        userId,
        mpRef,
        err: err?.message,
      },
      "[subscriptions] cancel falhou no MP"
    );
    throw new AppError("Falha ao cancelar no Mercado Pago. Tente novamente em instantes.", 502);
  }

  // Atualiza local conforme resposta do MP. Se MP confirmou cancelled,
  // status local vira 'cancelled'. Senão (MP retornou outro estado por
  // alguma razão), traduz pelo helper para manter sincronia.
  const localStatus = mapPreapprovalStatusToLocal(mpResult.status);

  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE user_subscriptions
      SET
        status = $3,
        cancel_at_period_end = true,
        updated_at = NOW()
      WHERE user_id = $1
        AND plan_id = $2
        AND created_at = $4
      `,
      [userId, sub.plan_id, localStatus, sub.created_at]
    );
  });

  logger.info(
    {
      domain: "subscriptions.cancel",
      userId,
      planId: sub.plan_id,
      mpRef,
      localStatus,
      requestId,
    },
    "[subscriptions] cancelada"
  );

  return {
    cancelled: true,
    plan_id: sub.plan_id,
    status: localStatus,
    cancel_at_period_end: true,
    // Data "até quando o benefício continua". O cancel só marca
    // cancel_at_period_end=true e NÃO altera expires_at, então o valor lido na
    // sub viva ainda é o correto. Devolvido aqui para a tela mostrar
    // "ativa até [data]" imediatamente, sem refazer o GET /subscriptions/me.
    expires_at: sub.expires_at ? new Date(sub.expires_at).toISOString() : null,
  };
}

/**
 * Estados locais que contam como assinatura "viva" para a tela do lojista.
 * Espelha LIVE_SUBSCRIPTION_STATUSES dos guards (mantido local para não
 * exportar um detalhe interno dos guards só por causa desta leitura).
 */
const RENDERABLE_LIVE_STATUSES = Object.freeze(["active", "pending", "paused"]);

/**
 * Estado da assinatura do PRÓPRIO usuário para a tela "Plano e cobranças".
 *
 * READ-ONLY: não toca em nada. Escopo SEMPRE pela sessão (`userId` vem do JWT
 * na rota, nunca do corpo/query do cliente) — é impossível pedir a assinatura
 * de outro usuário.
 *
 * Retorna a linha mais recente que seja:
 *   - viva (status active/pending/paused), OU
 *   - já cancelada mas ainda dentro do período pago
 *     (cancel_at_period_end=true e expires_at no futuro),
 * para que a tela consiga mostrar "cancelada — ativa até [data]".
 *
 * Sem assinatura relevante (ex.: plano gratuito) → `{ status: 'none' }`,
 * nunca um erro. `expires_at` é a coluna canônica "até quando o benefício
 * continua" neste schema.
 */
export async function getMySubscription({ userId }) {
  try {
    const { rows } = await query(
      `
      SELECT
        us.plan_id,
        us.status,
        us.expires_at,
        us.cancel_at_period_end,
        p.name AS plan_name
      FROM user_subscriptions us
      LEFT JOIN subscription_plans p ON p.id = us.plan_id
      WHERE us.user_id = $1
        AND (
          us.status = ANY($2::text[])
          OR (
            COALESCE(us.cancel_at_period_end, false) = true
            AND us.expires_at IS NOT NULL
            AND us.expires_at > NOW()
          )
        )
      ORDER BY us.created_at DESC
      LIMIT 1
      `,
      [String(userId), RENDERABLE_LIVE_STATUSES]
    );

    const row = rows[0];
    if (!row) return { status: "none" };

    return {
      status: row.status,
      plan_id: row.plan_id,
      plan_name: row.plan_name || null,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
    };
  } catch (err) {
    logger.error(
      { domain: "subscriptions.read", userId, err: err?.message },
      "[subscriptions] getMySubscription falhou"
    );
    // Degrada para "sem assinatura" — a tela não deve quebrar por causa disso.
    return { status: "none" };
  }
}
