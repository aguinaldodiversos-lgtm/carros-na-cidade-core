/**
 * Roteamento dos tópicos de ASSINATURA (preapproval) do Mercado Pago.
 *
 * Fase 2 — ATIVAÇÃO. O benefício (users.plan_id) só é ligado quando há
 * authorized_payment APPROVED com valor real; o preapproval 'authorized'
 * isolado apenas registra o vínculo (não escreve user_subscriptions).
 *
 * A verificação HMAC (MP_WEBHOOK_SECRET) roda em handleWebhookNotification
 * (payments.service.js) ANTES de chegar aqui — POST forjado com assinatura
 * inválida recebe 401 e nunca ativa.
 */
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import {
  getPreapproval,
  getAuthorizedPayment,
  mapPreapprovalStatusToLocal,
} from "./mercadopago-subscription.client.js";
import {
  findPlanIntentByPreapprovalId,
  recordPaymentAndActivate,
  recordUnresolvedApprovedPayment,
} from "./subscriptions.activation.js";

/**
 * Normaliza o tópico cru (de query ?type=/?topic= ou do corpo) para uma
 * das categorias acionáveis. 'preapproval' (sem prefixo) é tolerado por
 * segurança retroativa, mas o MP real envia 'subscription_preapproval'.
 */
export function classifyWebhookTopic(rawTopic) {
  const t = String(rawTopic || "")
    .toLowerCase()
    .trim();
  if (t === "subscription_preapproval" || t === "preapproval") return "subscription_preapproval";
  if (t === "subscription_authorized_payment") return "subscription_authorized_payment";
  if (t === "payment") return "payment";
  return "other";
}

/**
 * subscription_preapproval = mudança de status da assinatura. SÓ registra o
 * vínculo (resolvido via payment_intents). NÃO liga plan_id nem escreve
 * user_subscriptions — o benefício depende de pagamento aprovado.
 */
export async function handleSubscriptionPreapprovalEvent({ preapprovalId, traceRequestId }) {
  const pre = await getPreapproval(preapprovalId);
  const mpStatus = String(pre?.status || "");
  const localStatus = mapPreapprovalStatusToLocal(mpStatus);
  const intent = await findPlanIntentByPreapprovalId(preapprovalId);

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.webhook.subscription.preapproval",
        result: "success",
        requestId: traceRequestId,
        userId: intent?.user_id,
      }),
      preapprovalId: String(preapprovalId),
      mpStatus,
      localStatus,
      resolved: Boolean(intent),
      planId: intent?.plan_id || null,
      applied: false,
      phase: "await_payment",
    },
    mpStatus === "authorized"
      ? `[subscription] preapproval ${preapprovalId} authorized — vinculado (user=${
          intent?.user_id || "?"
        } plan=${intent?.plan_id || "?"}), aguardando 1º pagamento aprovado (benefício NÃO ligado)`
      : `[subscription] preapproval ${preapprovalId} status ${mpStatus} — sem ação (mudança de status é Fase 4)`
  );

  return {
    ok: true,
    topic: "subscription_preapproval",
    preapproval_id: String(preapprovalId),
    mp_status: mpStatus,
    local_status: localStatus,
    resolved: Boolean(intent),
    applied: false, // benefício só com pagamento aprovado
  };
}

/**
 * subscription_authorized_payment = cobrança mensal. ATIVA/renova SÓ quando o
 * pagamento está approved E o valor é válido E o intent resolve. Approved sem
 * resolução/valor → subscription_reconciliation (não some) + ACK 200.
 */
export async function handleSubscriptionAuthorizedPaymentEvent({
  authorizedPaymentId,
  traceRequestId,
}) {
  const ap = await getAuthorizedPayment(authorizedPaymentId);
  const preapprovalId = ap?.preapproval_id != null ? String(ap.preapproval_id) : null;
  const paymentStatus = ap?.payment?.status != null ? String(ap.payment.status) : null;
  const amount = Number(ap?.transaction_amount ?? ap?.payment?.transaction_amount);

  const baseLog = {
    action: "payments.webhook.subscription.authorized_payment",
    requestId: traceRequestId,
  };

  // Sem dinheiro confirmado → só loga (falha/pendente é Fase 4).
  if (paymentStatus !== "approved") {
    logger.info(
      { ...buildDomainFields({ ...baseLog, result: "success" }), authorizedPaymentId, preapprovalId, paymentStatus, applied: false },
      `[subscription] authorized_payment ${authorizedPaymentId} status ${paymentStatus} — sem ativar (Fase 4)`
    );
    return { ok: true, topic: "subscription_authorized_payment", applied: false, reason: "not_approved" };
  }

  // Approved mas SEM valor → não grava R$0; reconcilia (dinheiro a investigar).
  if (!Number.isFinite(amount) || amount <= 0) {
    await recordUnresolvedApprovedPayment({
      authorizedPaymentId,
      preapprovalId,
      amount: null,
      reason: "amount_missing",
      payload: { authorizedPaymentId, preapprovalId, paymentStatus },
    });
    logger.error(
      { ...buildDomainFields({ ...baseLog, result: "error" }), authorizedPaymentId, preapprovalId, reason: "amount_missing", applied: false },
      `[subscription] authorized_payment ${authorizedPaymentId} approved SEM valor — reconciliação, NÃO ativado`
    );
    return { ok: true, topic: "subscription_authorized_payment", applied: false, reason: "amount_missing" };
  }

  // Approved mas intent não resolve → reconcilia (dinheiro sem benefício).
  const intent = preapprovalId ? await findPlanIntentByPreapprovalId(preapprovalId) : null;
  if (!intent) {
    await recordUnresolvedApprovedPayment({
      authorizedPaymentId,
      preapprovalId,
      amount,
      reason: "intent_not_found",
      payload: { authorizedPaymentId, preapprovalId, amount },
    });
    logger.error(
      { ...buildDomainFields({ ...baseLog, result: "error" }), authorizedPaymentId, preapprovalId, amount, reason: "intent_not_found", resolved: false, applied: false },
      `[subscription] authorized_payment ${authorizedPaymentId} approved R$${amount} SEM intent (preapproval ${preapprovalId}) — reconciliação, NÃO ativado`
    );
    return { ok: true, topic: "subscription_authorized_payment", applied: false, resolved: false, reason: "intent_not_found" };
  }

  // Caminho feliz: ativa/renova (idempotente).
  const res = await recordPaymentAndActivate({
    preapprovalId,
    userId: intent.user_id,
    planId: intent.plan_id,
    authorizedPaymentId,
    amount,
  });

  logger.info(
    {
      ...buildDomainFields({ ...baseLog, result: "success", userId: intent.user_id }),
      authorizedPaymentId,
      preapprovalId,
      amount,
      planId: intent.plan_id,
      resolved: true,
      applied: res.activated,
      reason: res.reason || null,
    },
    `[subscription] authorized_payment ${authorizedPaymentId} approved R$${amount} → ${
      res.activated ? "ATIVADO/renovado" : `ignorado (${res.reason})`
    } user=${intent.user_id} plan=${intent.plan_id}`
  );

  return {
    ok: true,
    topic: "subscription_authorized_payment",
    preapproval_id: preapprovalId,
    amount,
    resolved: true,
    applied: res.activated,
    reason: res.reason || null,
  };
}
