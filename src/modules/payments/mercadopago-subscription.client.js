/**
 * Cliente isolado da API de Assinaturas (preapproval) do Mercado Pago.
 *
 * Camada FINA acima do `mpRequest`. Sem regra de negócio: validação de
 * plano, ownership e idempotência ficam na camada de service. Aqui só
 * traduz parâmetros do domínio para o payload exigido pelo MP.
 *
 * Em modo MOCK (sem MP_ACCESS_TOKEN) devolve respostas sintéticas
 * deterministicas — útil em dev local e CI sem credencial.
 *
 * Documentação MP: https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval/post
 */

import {
  mpRequest,
  isMercadoPagoMockMode,
  getMercadoPagoBackendPublicUrl,
} from "./payments.service.js";

const PREAPPROVAL_BASE = "/preapproval";

/**
 * Cria uma preapproval (assinatura recorrente mensal).
 *
 * @param {object} opts
 * @param {string} opts.planName  — usado como `reason` no MP
 * @param {number} opts.amount    — em BRL (ex: 79.90)
 * @param {string} opts.payerEmail
 * @param {string} opts.backUrl   — URL de sucesso após autorizar
 * @param {object} opts.metadata  — gravado no preapproval para rastreio
 *
 * @returns {Promise<{id: string, init_point: string, status: string}>}
 *   ID, link de autorização e status inicial (geralmente 'pending').
 */
export async function createPreapproval({
  planName,
  amount,
  payerEmail,
  backUrl,
  metadata = {},
}) {
  if (isMercadoPagoMockMode()) {
    const mockId = `mock-preapproval-${Date.now()}`;
    return {
      id: mockId,
      init_point: `${backUrl || "http://localhost"}?mock=1&preapproval=${encodeURIComponent(mockId)}`,
      status: "pending",
      mock: true,
    };
  }

  const notificationUrl = `${getMercadoPagoBackendPublicUrl()}/api/payments/webhook`;

  return mpRequest(PREAPPROVAL_BASE, {
    method: "POST",
    body: JSON.stringify({
      reason: planName,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(Number(amount).toFixed(2)),
        currency_id: "BRL",
      },
      back_url: backUrl,
      status: "pending",
      payer_email: payerEmail,
      notification_url: notificationUrl,
      metadata,
    }),
  });
}

/**
 * Busca o estado atual de uma preapproval. Usado pelo webhook para
 * confirmar status real (não confiar só no payload do webhook).
 */
export async function getPreapproval(preapprovalId) {
  if (isMercadoPagoMockMode()) {
    return { id: preapprovalId, status: "authorized", mock: true };
  }
  return mpRequest(`${PREAPPROVAL_BASE}/${encodeURIComponent(preapprovalId)}`, {
    method: "GET",
  });
}

/**
 * Cancela uma preapproval no Mercado Pago. Idempotente: chamar 2 vezes
 * não dá erro — segunda chamada simplesmente confirma cancellation.
 */
export async function cancelPreapproval(preapprovalId) {
  if (isMercadoPagoMockMode()) {
    return { id: preapprovalId, status: "cancelled", mock: true };
  }
  return mpRequest(`${PREAPPROVAL_BASE}/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/**
 * Pausa temporária (lojista pode retomar depois). MP usa status='paused'.
 */
export async function pausePreapproval(preapprovalId) {
  if (isMercadoPagoMockMode()) {
    return { id: preapprovalId, status: "paused", mock: true };
  }
  return mpRequest(`${PREAPPROVAL_BASE}/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "paused" }),
  });
}

/**
 * Reativa uma preapproval pausada (status='paused' → 'authorized').
 */
export async function reactivatePreapproval(preapprovalId) {
  if (isMercadoPagoMockMode()) {
    return { id: preapprovalId, status: "authorized", mock: true };
  }
  return mpRequest(`${PREAPPROVAL_BASE}/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "authorized" }),
  });
}

/**
 * Mapeia status do MP (preapproval) para os 6 estados locais alvo
 * da Fase 3C. Centraliza a tradução para evitar drift entre service +
 * webhook + cancel handler.
 *
 * Estados MP (canônico):
 *   pending      — aguardando primeira autorização do user
 *   authorized   — ativa, cobrando mensalmente
 *   paused       — pausada manualmente
 *   cancelled    — cancelada pelo user/admin
 *   finished     — chegou no fim da vigência (não-recorrente expirou)
 *   payment_in_process — cobrança em curso (consideramos active)
 *
 * Estados locais (Fase 3C):
 *   pending, active, paused, cancelled, payment_failed, expired
 */
export function mapPreapprovalStatusToLocal(mpStatus) {
  const s = String(mpStatus || "").toLowerCase();
  switch (s) {
    case "authorized":
    case "payment_in_process":
      return "active";
    case "paused":
      return "paused";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "finished":
      return "expired";
    case "rejected":
      return "payment_failed";
    case "pending":
    default:
      return "pending";
  }
}
