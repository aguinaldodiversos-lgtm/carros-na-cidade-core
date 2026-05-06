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
import {
  createPlanSubscription,
} from "./payments.service.js";

/**
 * Único conjunto de planos comerciais permitidos no fluxo de
 * assinatura recorrente da Fase 3C. Hardcoded (whitelist) para evitar
 * que admin cadastre um plano novo no banco e ele escape acidentalmente
 * para esse fluxo sem revisão de produto.
 *
 * cpf-premium-highlight (R$ 79,90 one-time, descontinuado) e
 * cnpj-evento-premium (Evento dormente) são REJEITADOS aqui mesmo
 * que algum dia retornem como is_active=true no banco.
 */
export const ALLOWED_SUBSCRIPTION_PLAN_IDS = Object.freeze([
  "cnpj-store-start",
  "cnpj-store-pro",
]);

const REJECTED_PLAN_IDS = Object.freeze([
  "cnpj-evento-premium", // Evento dormente — bloqueio explícito mesmo com flag
  "cpf-premium-highlight", // descontinuado, substituído por boost-7d avulso
]);

/**
 * Estados locais que contam como "assinatura ainda viva" — bloqueia
 * criar uma nova nesse momento (evita cobrar 2x o user por engano).
 * `paused` também bloqueia: lojista deve reativar a existente em vez
 * de criar uma nova.
 */
const LIVE_SUBSCRIPTION_STATUSES = Object.freeze(["active", "pending", "paused"]);

/**
 * Procura uma assinatura "viva" (status active/pending/paused) do user.
 * Não filtra por provider — qualquer sub local viva bloqueia.
 *
 * Retorna a row mais recente ou null.
 */
export async function findLiveSubscriptionForUser(userId) {
  // Defesa: query usa colunas da migration 024 quando disponíveis;
  // fallback para schema antigo (apenas user_id/plan_id/status/expires_at).
  const result = await query(
    `
    SELECT
      user_id,
      plan_id,
      status,
      expires_at,
      payment_id,
      created_at
    FROM user_subscriptions
    WHERE user_id = $1
      AND status = ANY($2::text[])
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId, LIVE_SUBSCRIPTION_STATUSES]
  );
  return result.rows[0] || null;
}

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

  // 1. Whitelist explícita (a primeira linha de defesa).
  if (!ALLOWED_SUBSCRIPTION_PLAN_IDS.includes(id)) {
    if (REJECTED_PLAN_IDS.includes(id)) {
      throw new AppError(
        `Plano ${id} indisponivel para assinatura recorrente.`,
        410
      );
    }
    throw new AppError(
      `plan_id deve ser um dos: ${ALLOWED_SUBSCRIPTION_PLAN_IDS.join(", ")}.`,
      400
    );
  }

  // 2. Bloqueio de duplicata: user já tem sub viva?
  const live = await findLiveSubscriptionForUser(userId);
  if (live) {
    throw new AppError(
      `Usuario ja possui assinatura ativa (plano: ${live.plan_id}, status: ${live.status}).`,
      409
    );
  }

  // 3. Delega para createPlanSubscription que faz:
  //    - validação adicional (is_active, billing_model='monthly', preço > 0)
  //    - validação de tipo (CPF vs CNPJ)
  //    - criação de payment_intents (context='plan', resource='preapproval')
  //    - chamada ao MP (preapproval)
  //    - retorna { plan_id, init_point, mercado_pago_id, public_key }
  //
  //    Preço vem 100% do banco/DEFAULT_PLANS — anti-spoof já existente.
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
    throw new AppError(
      "Falha ao cancelar no Mercado Pago. Tente novamente em instantes.",
      502
    );
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
  };
}
