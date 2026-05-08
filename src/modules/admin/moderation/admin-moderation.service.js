/**
 * Service da fila de moderação (Tarefa 7).
 *
 * - listPending(filters): GET /api/admin/moderation/ads
 * - getDetail(adId):      GET /api/admin/moderation/ads/:id
 * - approve(adminUserId, adId):              POST .../approve
 * - reject(adminUserId, adId, reason):       POST .../reject
 * - requestCorrection(adminUserId, adId, reason): POST .../request-correction
 *
 * Todas as transições são auditadas em `ad_moderation_events` e em
 * `admin_actions` (compatibilidade com o restante do painel admin).
 */

import db from "../../../infrastructure/database/db.js";
import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { AD_STATUS } from "../../../shared/constants/status.js";
import { recordAdminAction } from "../admin.audit.js";
import {
  fetchModerationDetail,
  recordModerationEvent,
} from "../../ads/risk/ad-risk.repository.js";
import { MODERATION_EVENT } from "../../ads/risk/ad-risk.thresholds.js";
import { invalidateAdsCachesAfterMutation } from "../../ads/ads.mutation-cache.js";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function listPending(filters = {}) {
  const limit = clampInt(filters.limit, 1, 200, 50);
  const offset = clampInt(filters.offset, 0, 1_000_000, 0);

  const where = [`a.status = $1`];
  const params = [AD_STATUS.PENDING_REVIEW];

  if (filters.city_id) {
    params.push(Number(filters.city_id));
    where.push(`a.city_id = $${params.length}`);
  }
  if (filters.severity) {
    params.push(String(filters.severity));
    where.push(`a.risk_level = $${params.length}`);
  }
  if (filters.below_fipe_only === "true" || filters.below_fipe_only === true) {
    where.push(`a.fipe_diff_percent IS NOT NULL AND a.fipe_diff_percent <= -20`);
  }

  params.push(limit);
  params.push(offset);

  const result = await db.query(
    `
    SELECT
      a.id, a.title, a.brand, a.model, a.year, a.price, a.city, a.state,
      a.status, a.risk_score, a.risk_level, a.risk_reasons,
      a.fipe_reference_value, a.fipe_diff_percent,
      a.created_at, a.updated_at,
      a.advertiser_id, adv.user_id AS advertiser_user_id, adv.name AS advertiser_name
    FROM ads a
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE ${where.join(" AND ")}
    ORDER BY a.risk_score DESC, a.created_at ASC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
    `,
    params
  );

  const countResult = await db.query(
    `
    SELECT COUNT(*)::int AS total
    FROM ads a
    WHERE ${where.slice(0, where.length).join(" AND ")}
    `,
    params.slice(0, params.length - 2)
  );

  return {
    data: result.rows,
    total: Number(countResult.rows[0]?.total || 0),
    limit,
    offset,
  };
}

export async function getDetail(adId) {
  const detail = await fetchModerationDetail(adId);
  if (!detail) throw new AppError("Anúncio não encontrado", 404);
  return detail;
}

async function loadAdForModeration(adId) {
  const result = await db.query(
    `SELECT id, status FROM ads WHERE id = $1 LIMIT 1`,
    [adId]
  );
  const row = result.rows[0];
  if (!row) throw new AppError("Anúncio não encontrado", 404);
  return row;
}

export async function approve(adminUserId, adId) {
  const ad = await loadAdForModeration(adId);
  if (ad.status !== AD_STATUS.PENDING_REVIEW) {
    throw new AppError(
      `Anúncio em status '${ad.status}' não pode ser aprovado pela fila de moderação.`,
      400
    );
  }

  await db.query(
    `
    UPDATE ads
    SET status = $2,
        reviewed_at = NOW(),
        reviewed_by = $3,
        rejection_reason = NULL,
        correction_requested_reason = NULL,
        updated_at = NOW()
    WHERE id = $1
    `,
    [adId, AD_STATUS.ACTIVE, String(adminUserId)]
  );

  await recordModerationEvent({
    adId,
    eventType: MODERATION_EVENT.MODERATION_APPROVED,
    actorUserId: adminUserId,
    actorRole: "admin",
    fromStatus: AD_STATUS.PENDING_REVIEW,
    toStatus: AD_STATUS.ACTIVE,
    reason: null,
    metadata: {},
  });

  await recordAdminAction({
    adminUserId,
    action: "moderation_approve",
    targetType: "ad",
    targetId: String(adId),
    oldValue: { status: AD_STATUS.PENDING_REVIEW },
    newValue: { status: AD_STATUS.ACTIVE },
    reason: null,
  });

  await invalidateAdsCachesAfterMutation().catch(() => {});

  return { ok: true, status: AD_STATUS.ACTIVE };
}

export async function reject(adminUserId, adId, reason) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) {
    throw new AppError("Motivo da rejeição é obrigatório.", 400);
  }
  const ad = await loadAdForModeration(adId);
  if (ad.status !== AD_STATUS.PENDING_REVIEW) {
    throw new AppError(
      `Anúncio em status '${ad.status}' não pode ser rejeitado pela fila de moderação.`,
      400
    );
  }

  await db.query(
    `
    UPDATE ads
    SET status = $2,
        reviewed_at = NOW(),
        reviewed_by = $3,
        rejection_reason = $4,
        correction_requested_reason = NULL,
        updated_at = NOW()
    WHERE id = $1
    `,
    [adId, AD_STATUS.REJECTED, String(adminUserId), trimmed]
  );

  await recordModerationEvent({
    adId,
    eventType: MODERATION_EVENT.MODERATION_REJECTED,
    actorUserId: adminUserId,
    actorRole: "admin",
    fromStatus: AD_STATUS.PENDING_REVIEW,
    toStatus: AD_STATUS.REJECTED,
    reason: trimmed,
    metadata: {},
  });

  await recordAdminAction({
    adminUserId,
    action: "moderation_reject",
    targetType: "ad",
    targetId: String(adId),
    oldValue: { status: AD_STATUS.PENDING_REVIEW },
    newValue: { status: AD_STATUS.REJECTED, reason: trimmed },
    reason: trimmed,
  });

  await invalidateAdsCachesAfterMutation().catch(() => {});

  return { ok: true, status: AD_STATUS.REJECTED };
}

export async function requestCorrection(adminUserId, adId, reason) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) {
    throw new AppError("Motivo da solicitação é obrigatório.", 400);
  }
  const ad = await loadAdForModeration(adId);
  if (ad.status !== AD_STATUS.PENDING_REVIEW) {
    throw new AppError(
      `Anúncio em status '${ad.status}' não pode receber solicitação de correção.`,
      400
    );
  }

  // Mantém status em PENDING_REVIEW (anúncio NÃO volta a ser público) e
  // grava o motivo. Decisão arquitetural: usar DRAFT exigiria fluxo do dono
  // para "reenviar" (ainda fora de escopo da rodada). PENDING_REVIEW +
  // correction_requested_reason cobre o caso sem novas telas/rotas.
  await db.query(
    `
    UPDATE ads
    SET correction_requested_reason = $2,
        reviewed_at = NOW(),
        reviewed_by = $3,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = $1
    `,
    [adId, trimmed, String(adminUserId)]
  );

  await recordModerationEvent({
    adId,
    eventType: MODERATION_EVENT.CORRECTION_REQUESTED,
    actorUserId: adminUserId,
    actorRole: "admin",
    fromStatus: AD_STATUS.PENDING_REVIEW,
    toStatus: AD_STATUS.PENDING_REVIEW,
    reason: trimmed,
    metadata: {},
  });

  await recordAdminAction({
    adminUserId,
    action: "moderation_request_correction",
    targetType: "ad",
    targetId: String(adId),
    oldValue: { status: AD_STATUS.PENDING_REVIEW },
    newValue: { correction_requested_reason: trimmed },
    reason: trimmed,
  });

  return { ok: true, status: AD_STATUS.PENDING_REVIEW };
}
