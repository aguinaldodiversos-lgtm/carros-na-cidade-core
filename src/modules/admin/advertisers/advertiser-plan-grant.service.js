/**
 * Concessão MANUAL de plano (admin → anunciante).
 *
 * Regra conceitual (auditoria 2026-06-25):
 *   - NÃO gera payment, NÃO chama Mercado Pago, NÃO depende de PAYMENTS_LIVE.
 *   - Escreve em user_subscriptions (source='admin_grant') E sincroniza
 *     users.plan_id — a fonte de verdade do plano efetivo lida por
 *     account.service.resolveCurrentPlan. Os benefícios (ad_limit, fotos,
 *     prioridade) saem do MESMO resolver do fluxo pago; zero duplicação.
 *   - Tem início, fim (expires_at), motivo obrigatório e admin responsável.
 *   - Expira via sweep lazy (sem cron): revertendo users.plan_id ao vencer.
 *
 * Segurança: as rotas que chamam estas funções já passam por authMiddleware
 * + requireAdmin (role='admin') no admin.routes. Usuário comum recebe 403
 * antes de chegar aqui.
 */

import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-advertisers.repository.js";
import {
  GRANT_SOURCE,
  MAX_GRANT_DAYS,
  MAX_GRANT_MONTHS,
  DAYS_PER_MONTH,
  GRANT_REASON_TYPES,
  reasonLabel,
  originLabel,
} from "./advertiser-plan-grant.constants.js";

/** CPF/CNPJ canônico a partir de users.document_type (default CPF). */
function normalizeAccountType(documentType) {
  return String(documentType || "").trim().toUpperCase() === "CNPJ" ? "CNPJ" : "CPF";
}

/**
 * Resolve a duração em dias a partir de duration_days OU duration_months.
 * Limites: meses 1..MAX_GRANT_MONTHS; dias 1..MAX_GRANT_DAYS. Rejeita 0,
 * negativo e absurdos. Exportada para teste unitário direto.
 */
export function resolveGrantDays({ durationDays, durationMonths } = {}) {
  const hasDays = durationDays !== undefined && durationDays !== null && durationDays !== "";
  const hasMonths =
    durationMonths !== undefined && durationMonths !== null && durationMonths !== "";

  let days;
  if (hasDays) {
    days = Number(durationDays);
    if (!Number.isInteger(days)) {
      throw new AppError("duration_days deve ser um número inteiro de dias.", 400);
    }
  } else if (hasMonths) {
    const months = Number(durationMonths);
    if (!Number.isInteger(months) || months < 1 || months > MAX_GRANT_MONTHS) {
      throw new AppError(`duration_months deve ser inteiro entre 1 e ${MAX_GRANT_MONTHS}.`, 400);
    }
    days = months * DAYS_PER_MONTH;
  } else {
    throw new AppError("Informe duration_days ou duration_months.", 400);
  }

  if (days < 1) {
    throw new AppError("Duração inválida — mínimo de 1 dia.", 400);
  }
  if (days > MAX_GRANT_DAYS) {
    throw new AppError(`Duração excede o máximo permitido de ${MAX_GRANT_DAYS} dias.`, 400);
  }
  return days;
}

function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

/**
 * Sweep lazy de expiração para UM usuário. Defensivo: nunca lança para não
 * quebrar o caminho de leitura (detalhe do anunciante) onde é chamado. Audita
 * cada concessão expirada como ação do "system".
 */
export async function expireDueGrantsForUser(userId) {
  if (!userId) return [];
  try {
    const expired = await repo.expireDueGrants({ userId });
    for (const row of expired) {
      await recordAdminAction({
        adminUserId: "system",
        action: "expire_advertiser_plan",
        targetType: "advertiser_user",
        targetId: row.user_id,
        oldValue: { plan_id: row.plan_id, status: "active" },
        newValue: { status: "expired" },
        reason: "Expiração automática de plano concedido manualmente",
      });
    }
    return expired;
  } catch {
    return [];
  }
}

/**
 * Monta o bloco de informação de plano exibido no detalhe do anunciante:
 * plano efetivo, origem (Pago / Cortesia / Teste grátis / Manual / Gratuito)
 * e — quando houver concessão manual ativa — início, expiração, dias
 * restantes, quem concedeu e motivo.
 */
export async function buildAdvertiserPlanInfo(userId) {
  const [effective, grant, paid] = await Promise.all([
    repo.getEffectivePlan(userId),
    repo.getActiveGrant(userId),
    repo.findLivePaidSubscription(userId),
  ]);

  const effectivePlanId = effective?.plan_id || null;
  const effectivePlanName = effective?.plan_name || null;
  const billingModel = effective?.billing_model || null;

  let originKind = "free";
  let originText = "Gratuito";

  const grantActiveAndEffective = grant && grant.plan_id === effectivePlanId;

  if (grantActiveAndEffective) {
    originKind = "grant";
    originText = originLabel(grant.grant_reason_type);
  } else if (paid) {
    originKind = "paid";
    originText = "Pago";
  } else if (billingModel === "monthly" || billingModel === "one_time") {
    originKind = "paid";
    originText = "Pago";
  } else {
    originKind = "free";
    originText = "Gratuito";
  }

  return {
    effective_plan_id: effectivePlanId,
    effective_plan_name: effectivePlanName,
    plan_origin_kind: originKind,
    plan_origin_label: originText,
    plan_grant: grantActiveAndEffective
      ? {
          source: grant.source,
          reason_type: grant.grant_reason_type,
          reason_label: reasonLabel(grant.grant_reason_type),
          reason_note: grant.grant_reason_note || null,
          starts_at: grant.starts_at || null,
          expires_at: grant.expires_at || null,
          days_remaining: daysRemaining(grant.expires_at),
          granted_by_admin_id: grant.granted_by_admin_id || null,
          granted_by_name: grant.granted_by_name || grant.granted_by_email || null,
        }
      : null,
  };
}

/**
 * Concede um plano por tempo determinado. Valida tudo, BLOQUEIA substituição
 * de assinatura paga viva (409), substitui concessão manual anterior, seta
 * o plano efetivo e audita. Retorna o resumo da concessão.
 */
export async function grantAdvertiserPlan(adminUserId, advertiserId, input = {}) {
  const { planId, durationDays, durationMonths, reasonType, reasonNote } = input;

  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);

  const userId = advertiser.user_id;
  if (!userId) {
    throw new AppError("Anunciante não possui usuário vinculado para receber o plano.", 400);
  }

  // Motivo categorizado (obrigatório, fechado).
  const type = String(reasonType || "").trim().toLowerCase();
  if (!GRANT_REASON_TYPES.includes(type)) {
    throw new AppError(
      `reason_type inválido. Use um de: ${GRANT_REASON_TYPES.join(", ")}.`,
      400
    );
  }

  // Observação (obrigatória).
  const note = typeof reasonNote === "string" ? reasonNote.trim() : "";
  if (!note) {
    throw new AppError("Observação (reason_note) é obrigatória.", 400);
  }
  if (note.length > 500) {
    throw new AppError("Observação (reason_note) aceita no máximo 500 caracteres.", 400);
  }

  // Duração (valida limites antes de tocar o banco).
  const days = resolveGrantDays({ durationDays, durationMonths });

  // Plano: precisa existir, estar ativo e ser compatível com o documento.
  const plan = await repo.findPlanForGrant(String(planId || "").trim());
  if (!plan) throw new AppError("Plano não encontrado", 404);
  if (!plan.is_active) {
    throw new AppError("Plano inativo — ative o plano antes de concedê-lo.", 400);
  }
  const accountType = normalizeAccountType(advertiser.document_type);
  if (plan.type !== accountType) {
    throw new AppError(
      `Plano (${plan.type}) incompatível com o documento do anunciante (${accountType}).`,
      400
    );
  }

  // Limpa concessões já vencidas antes de aplicar a nova.
  await expireDueGrantsForUser(userId);

  // NÃO sobrescreve assinatura paga ativa sem ação explícita.
  const paid = await repo.findLivePaidSubscription(userId);
  if (paid) {
    throw new AppError(
      `Anunciante possui assinatura paga ativa (plano: ${paid.plan_name || paid.plan_id}). ` +
        `Cancele a assinatura paga antes de conceder um plano manual.`,
      409
    );
  }

  const before = await repo.getEffectivePlan(userId);
  const startsAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  await repo.createGrant({
    userId,
    planId: plan.id,
    status: "active",
    source: GRANT_SOURCE,
    startsAt,
    expiresAt,
    grantedByAdminId: String(adminUserId),
    reasonType: type,
    reasonNote: note,
    metadata: {
      advertiser_id: String(advertiserId),
      duration_days: days,
      reason_type: type,
    },
  });

  await recordAdminAction({
    adminUserId,
    action: "grant_advertiser_plan",
    targetType: "advertiser",
    targetId: advertiserId,
    oldValue: { plan_id: before?.plan_id || null },
    newValue: {
      plan_id: plan.id,
      source: GRANT_SOURCE,
      status: "active",
      starts_at: startsAt,
      expires_at: expiresAt,
      duration_days: days,
      reason_type: type,
    },
    reason: note,
  });

  return {
    advertiser_id: advertiserId,
    user_id: userId,
    plan_id: plan.id,
    plan_name: plan.name,
    source: GRANT_SOURCE,
    status: "active",
    starts_at: startsAt,
    expires_at: expiresAt,
    duration_days: days,
    days_remaining: daysRemaining(expiresAt),
    reason_type: type,
    reason_label: reasonLabel(type),
    reason_note: note,
  };
}

/**
 * Revoga a concessão manual ativa do anunciante (volta ao pago vigente ou ao
 * gratuito). Motivo obrigatório. Audita como 'revoke_advertiser_plan'.
 */
export async function revokeAdvertiserPlan(adminUserId, advertiserId, reason) {
  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);

  const userId = advertiser.user_id;
  if (!userId) throw new AppError("Anunciante não possui usuário vinculado.", 400);

  const note = typeof reason === "string" ? reason.trim() : "";
  if (!note) throw new AppError("Motivo da revogação é obrigatório.", 400);

  const active = await repo.getActiveGrant(userId);
  if (!active) {
    throw new AppError("Não há plano concedido ativo para revogar.", 404);
  }

  const result = await repo.revokeGrant({ userId });

  await recordAdminAction({
    adminUserId,
    action: "revoke_advertiser_plan",
    targetType: "advertiser",
    targetId: advertiserId,
    oldValue: { plan_id: active.plan_id, status: "active" },
    newValue: { status: "cancelled", reverted_to: result.reverted_to || "free" },
    reason: note,
  });

  return {
    advertiser_id: advertiserId,
    user_id: userId,
    revoked_plan_id: active.plan_id,
    reverted_to: result.reverted_to || null,
  };
}
