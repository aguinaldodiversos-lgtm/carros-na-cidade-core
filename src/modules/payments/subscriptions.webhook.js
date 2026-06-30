/**
 * Roteamento e detecção dos tópicos de ASSINATURA (preapproval) do
 * Mercado Pago — Fase 1: detectar + logar. NÃO altera plan_id nem
 * user_subscriptions (ativação é a Fase 2). Mantido fora de
 * payments.service.js para deixar a fronteira com o pagamento avulso
 * (boost/destaque, em produção) auditável.
 */
import { query } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import {
  getPreapproval,
  getAuthorizedPayment,
  mapPreapprovalStatusToLocal,
} from "./mercadopago-subscription.client.js";

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

/** Resolve a assinatura local pelo preapproval_id do MP (não pelo payment id). */
export async function findSubscriptionByPreapprovalId(preapprovalId) {
  const id = String(preapprovalId || "").trim();
  if (!id) return null;
  const result = await query(
    `
    SELECT user_id, plan_id, status, provider_preapproval_id, created_at
    FROM user_subscriptions
    WHERE provider_preapproval_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [id]
  );
  return result.rows[0] || null;
}

/** subscription_preapproval = mudança de status da assinatura. */
export async function handleSubscriptionPreapprovalEvent({ preapprovalId, traceRequestId }) {
  const pre = await getPreapproval(preapprovalId);
  const mpStatus = String(pre?.status || "");
  const localStatus = mapPreapprovalStatusToLocal(mpStatus); // 'cancelled' (2 L) é canônico aqui
  const sub = await findSubscriptionByPreapprovalId(preapprovalId);

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.webhook.subscription.preapproval",
        result: "success",
        requestId: traceRequestId,
        userId: sub?.user_id,
      }),
      preapprovalId: String(preapprovalId),
      mpStatus,
      localStatus,
      resolved: Boolean(sub),
      planId: sub?.plan_id || null,
      phase: "detect_only",
    },
    sub
      ? `[subscription] preapproval ${preapprovalId} status ${mpStatus} resolvido para subscription local user=${sub.user_id} plan=${sub.plan_id} (local=${localStatus})`
      : `[subscription] preapproval ${preapprovalId} status ${mpStatus} sem subscription local vinculada (provider_preapproval_id ainda não gravado — Fase 2)`
  );

  return {
    ok: true,
    topic: "subscription_preapproval",
    preapproval_id: String(preapprovalId),
    mp_status: mpStatus,
    local_status: localStatus,
    resolved: Boolean(sub),
    applied: false, // Fase 1: detecção apenas
  };
}

/** subscription_authorized_payment = cobrança mensal (renovação). */
export async function handleSubscriptionAuthorizedPaymentEvent({
  authorizedPaymentId,
  traceRequestId,
}) {
  const ap = await getAuthorizedPayment(authorizedPaymentId);
  const preapprovalId = ap?.preapproval_id != null ? String(ap.preapproval_id) : null;
  const apStatus = String(ap?.status || "");
  const paymentStatus = ap?.payment?.status != null ? String(ap.payment.status) : null;
  const sub = preapprovalId ? await findSubscriptionByPreapprovalId(preapprovalId) : null;

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.webhook.subscription.authorized_payment",
        result: "success",
        requestId: traceRequestId,
        userId: sub?.user_id,
      }),
      authorizedPaymentId: String(authorizedPaymentId),
      preapprovalId,
      apStatus,
      paymentStatus,
      resolved: Boolean(sub),
      planId: sub?.plan_id || null,
      phase: "detect_only",
    },
    `[subscription] authorized_payment ${authorizedPaymentId} do preapproval ${
      preapprovalId || "?"
    } status ${apStatus}${paymentStatus ? ` (payment ${paymentStatus})` : ""}${
      sub ? ` → subscription local user=${sub.user_id} plan=${sub.plan_id}` : " (sem vínculo local)"
    }`
  );

  return {
    ok: true,
    topic: "subscription_authorized_payment",
    authorized_payment_id: String(authorizedPaymentId),
    preapproval_id: preapprovalId,
    ap_status: apStatus,
    payment_status: paymentStatus,
    resolved: Boolean(sub),
    applied: false, // Fase 1: detecção apenas
  };
}
