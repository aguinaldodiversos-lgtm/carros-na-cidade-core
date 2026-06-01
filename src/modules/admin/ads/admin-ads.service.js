import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { AD_STATUS, isValidAdStatus } from "../../../shared/constants/status.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-ads.repository.js";

/**
 * Reason mínimo aceito em ações sensíveis de destaque (Fase 3.2).
 *
 * 3 chars permitem "POC", "OK", "ok" se trim. Mas em prática queremos algo
 * substantivo. O número 3 está alinhado com a regra default discutida no
 * escopo da Fase 3.2 ("trim().length >= 3"). Mantemos curto para não
 * frustrar admin com motivos legítimos abreviados; o que NÃO aceitamos é
 * reason vazio/null/whitespace.
 *
 * Limite superior 500 chars (alinhado a admin-seo.service.js:139).
 */
const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;

/**
 * Valida reason para ações de destaque manual (grantManualBoost,
 * setAdHighlight set/clear). Lança AppError 400 se inválido.
 *
 * Defesa em profundidade: o frontend já bloqueia o botão via
 * AdminActionDialog#requireReason, mas qualquer chamada direta ao endpoint
 * (curl, integração) precisa ser barrada aqui ANTES da mutation/audit.
 *
 * @returns {string} reason normalizado (trim + slice MAX)
 */
function requireReasonForHighlightAction(reason, action) {
  if (typeof reason !== "string") {
    throw new AppError(`Motivo obrigatório para ${action}`, 400);
  }
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN_LENGTH) {
    throw new AppError(
      `Motivo obrigatório para ${action} (mínimo ${REASON_MIN_LENGTH} caracteres)`,
      400
    );
  }
  return trimmed.slice(0, REASON_MAX_LENGTH);
}

/**
 * Validação compartilhada de reason para arquivar/restaurar (Fase 3.5).
 * Mesma regra de min/max do destaque manual — mensagem específica por ação.
 */
function requireReasonForArchiveAction(reason, action) {
  if (typeof reason !== "string") {
    throw new AppError(`Motivo obrigatório para ${action}`, 400);
  }
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN_LENGTH) {
    throw new AppError(
      `Motivo obrigatório para ${action} (mínimo ${REASON_MIN_LENGTH} caracteres)`,
      400
    );
  }
  return trimmed.slice(0, REASON_MAX_LENGTH);
}

export async function listAds(filters) {
  return repo.listAds(filters);
}

export async function getAdById(id) {
  const ad = await repo.findById(id);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);
  return ad;
}

export async function changeAdStatus(adminUserId, adId, newStatus, reason = null) {
  if (!isValidAdStatus(newStatus)) {
    throw new AppError(`Status inválido: ${newStatus}`, 400);
  }

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  const oldStatus = ad.status;

  if (oldStatus === AD_STATUS.DELETED && newStatus !== AD_STATUS.DELETED) {
    throw new AppError("Anúncios deletados não podem ser restaurados por esta via", 400);
  }

  if (newStatus === AD_STATUS.BLOCKED && reason) {
    await repo.updateBlockedReason(adId, reason);
  }

  const updated = await repo.updateStatus(adId, newStatus);

  await recordAdminAction({
    adminUserId,
    action: "change_ad_status",
    targetType: "ad",
    targetId: adId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus, reason },
    reason,
  });

  return updated;
}

export async function setAdHighlight(adminUserId, adId, highlightUntil, reason = null) {
  const clearing = highlightUntil == null;
  // Reason OBRIGATÓRIO — ação sensível registrada em admin_actions.
  // Validar ANTES de buscar o anúncio para falhar fechado (Fase 3.2).
  const normalizedReason = requireReasonForHighlightAction(
    reason,
    clearing ? "remover destaque manual" : "definir destaque manual"
  );

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  if (!clearing && ad.status !== AD_STATUS.ACTIVE) {
    throw new AppError("Apenas anúncios ativos podem ser destacados", 400);
  }

  const oldHighlight = ad.highlight_until;
  const updated = await repo.updateHighlight(adId, clearing ? null : highlightUntil);

  await recordAdminAction({
    adminUserId,
    action: clearing ? "clear_ad_highlight" : "set_ad_highlight",
    targetType: "ad",
    targetId: adId,
    oldValue: { highlight_until: oldHighlight },
    newValue: { highlight_until: clearing ? null : highlightUntil },
    reason: normalizedReason,
  });

  return updated;
}

export async function setAdPriority(adminUserId, adId, priority, reason = null) {
  const numPriority = Number(priority);
  if (!Number.isFinite(numPriority) || numPriority < 0 || numPriority > 100) {
    throw new AppError("Priority deve ser entre 0 e 100", 400);
  }

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  const oldPriority = ad.priority;
  const updated = await repo.updatePriority(adId, numPriority);

  await recordAdminAction({
    adminUserId,
    action: "set_ad_priority",
    targetType: "ad",
    targetId: adId,
    oldValue: { priority: oldPriority },
    newValue: { priority: numPriority },
    reason,
  });

  return updated;
}

export async function grantManualBoost(adminUserId, adId, days, reason = null) {
  // Reason OBRIGATÓRIO — Fase 3.2. Validar ANTES de qualquer leitura ou
  // mutação, com mensagem específica da ação para facilitar diagnóstico.
  const normalizedReason = requireReasonForHighlightAction(reason, "aplicar destaque manual");

  const numDays = Number(days);
  if (!Number.isFinite(numDays) || numDays < 1 || numDays > 365) {
    throw new AppError("Dias de boost deve ser entre 1 e 365", 400);
  }

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  if (ad.status === AD_STATUS.DELETED || ad.status === AD_STATUS.BLOCKED) {
    throw new AppError("Não é possível impulsionar anúncio deletado ou bloqueado", 400);
  }

  const currentHighlight = ad.highlight_until;
  const baseDate =
    currentHighlight && new Date(currentHighlight) > new Date()
      ? new Date(currentHighlight)
      : new Date();
  const newHighlight = new Date(baseDate.getTime() + numDays * 24 * 60 * 60 * 1000);

  const updated = await repo.updateHighlight(adId, newHighlight.toISOString());

  // Fase 3.3: destaque manual mexe APENAS em highlight_until.
  // O ranking comercial é decidido por `commercialLayerExpr` em
  // ads-ranking.sql.js — anúncio com `highlight_until > NOW()` já vai
  // para a camada 4 (acima de Pro/Start/Free) automaticamente. NÃO mexer
  // em `ads.priority`: priority é eixo manual/admin separado (set_ad_priority),
  // e somar 8 distorcia o tiebreaker do hybrid_score sem justificativa
  // documentada (gerou priority=9 inconsistente em prod).

  await recordAdminAction({
    adminUserId,
    action: "grant_manual_boost",
    targetType: "ad",
    targetId: adId,
    oldValue: { highlight_until: currentHighlight, priority: ad.priority },
    newValue: {
      highlight_until: newHighlight.toISOString(),
      priority: ad.priority, // preservado (informativo no audit)
      days: numDays,
    },
    reason: normalizedReason,
  });

  return { ...updated, highlight_until: newHighlight.toISOString() };
}

// ───────────────────────────────────────────────────────────────────
// Fase 3.5 — Arquivar / restaurar anúncio (substitui "deletar" como
// ação operacional comum, preservando histórico)
// ───────────────────────────────────────────────────────────────────

/**
 * Arquiva um anúncio (remove do catálogo público preservando o registro
 * para histórico do anunciante, auditoria e métricas).
 *
 * Diferenças em relação a outros estados:
 *   - blocked  → moderação/fraude (preenche blocked_reason/blocked_at)
 *   - deleted  → soft-delete (legado, evitar como ação comum)
 *   - archived → limpeza operacional, NÃO é punição
 *
 * Reason OBRIGATÓRIO (defesa em profundidade — UI também exige).
 * Idempotência: se já archived, no-op (sem nova admin_action, sem update).
 */
export async function archiveAd(adminUserId, adId, reason) {
  const normalizedReason = requireReasonForArchiveAction(reason, "arquivar anúncio");

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  if (ad.status === AD_STATUS.ARCHIVED) {
    // Já arquivado — devolver o estado atual sem registrar admin_action
    // (evita poluir auditoria com duplicatas em retries idempotentes).
    return ad;
  }

  if (ad.status === AD_STATUS.DELETED) {
    throw new AppError("Anúncio deletado não pode ser arquivado por esta via", 400);
  }

  const updated = await repo.archiveAd(adId, String(adminUserId), normalizedReason);

  await recordAdminAction({
    adminUserId,
    action: "archive_ad",
    targetType: "ad",
    targetId: adId,
    oldValue: {
      status: ad.status,
      highlight_until: ad.highlight_until,
      priority: ad.priority,
    },
    newValue: {
      status: AD_STATUS.ARCHIVED,
      archived_at: updated?.archived_at ?? null,
      reason: normalizedReason,
    },
    reason: normalizedReason,
  });

  return updated;
}

/**
 * Restaura um anúncio arquivado para um status operacional.
 * Default `'active'`; caller pode passar `'paused'` se preferir reativar em
 * modo silencioso. `'archived' → 'blocked'` NÃO é permitido por esta via
 * (use changeAdStatus se a intenção for bloquear após restauração).
 */
const RESTORE_ALLOWED_TARGETS = Object.freeze([AD_STATUS.ACTIVE, AD_STATUS.PAUSED]);

export async function restoreAd(adminUserId, adId, reason, newStatus = AD_STATUS.ACTIVE) {
  if (!RESTORE_ALLOWED_TARGETS.includes(newStatus)) {
    throw new AppError(
      `Status alvo de restauração inválido. Use um de: ${RESTORE_ALLOWED_TARGETS.join(", ")}`,
      400
    );
  }
  const normalizedReason = requireReasonForArchiveAction(reason, "restaurar anúncio arquivado");

  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);

  if (ad.status !== AD_STATUS.ARCHIVED) {
    throw new AppError(
      `Anúncio não está arquivado (status atual: ${ad.status}). Use changeAdStatus para outros estados.`,
      400
    );
  }

  const updated = await repo.restoreAd(adId, newStatus);

  await recordAdminAction({
    adminUserId,
    action: "restore_ad",
    targetType: "ad",
    targetId: adId,
    oldValue: {
      status: AD_STATUS.ARCHIVED,
      archived_at: ad.archived_at,
      archive_reason: ad.archive_reason,
    },
    newValue: { status: newStatus, reason: normalizedReason },
    reason: normalizedReason,
  });

  return updated;
}

export async function getAdMetrics(adId) {
  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);
  return repo.getAdMetrics(adId);
}

export async function getAdEvents(adId, options) {
  const ad = await repo.findById(adId);
  if (!ad) throw new AppError("Anúncio não encontrado", 404);
  return repo.getAdEvents(adId, options);
}
