/**
 * Canonical status definitions for the entire application.
 *
 * Every service, worker, query, and controller MUST use these constants
 * instead of raw string literals when referencing domain status values.
 *
 * SEMANTIC DEFINITIONS
 * ====================
 *
 * AD STATUS
 * ---------
 * draft           — Rascunho (reservado; admin pode usar quando solicitar
 *                   correção sem rejeitar). Não exibido publicamente.
 * pending_review  — Anúncio retido para análise antifraude/moderação. NUNCA
 *                   aparece publicamente. Aguarda decisão do admin (approve /
 *                   reject / request_correction).
 * active          — Published and visible in the public catalog. Accepts leads.
 * paused          — Owner-initiated pause. Hidden from catalog but preserved.
 *                   Owner can re-activate at any time.
 * sold            — Marcado como vendido pelo dono. Hidden from catalog mas
 *                   preservado para histórico/relatório.
 * expired         — Expirado por inatividade ou prazo. Hidden from catalog.
 * rejected        — Reprovado pela moderação. NUNCA aparece publicamente.
 *                   Pode ser corrigido pelo dono (vira pending_review novamente).
 * deleted         — Soft-deleted by owner. Hidden everywhere. Cannot be restored
 *                   via normal flow. Still exists in DB for audit/analytics.
 * blocked         — Administratively blocked (e.g. policy violation). Hidden
 *                   from catalog. Owner sees "blocked" in dashboard. Only admin
 *                   can unblock.
 *
 * Catalog visibility rule: ONLY ads with status = 'active' appear in public
 * listings and searches. The "highlighted" state is NOT a status — it is
 * determined by `highlight_until > NOW()` on an active ad.
 *
 * ADVERTISER STATUS
 * -----------------
 * active    — Normal operating state. Can create/manage ads.
 * suspended — Temporarily restricted by admin. Existing active ads become
 *             invisible in catalog while suspended. Can be reinstated.
 * blocked   — Permanently blocked by admin. All ads hidden. Account locked.
 *
 * USER ROLE
 * ---------
 * user      — Default role. Regular user / advertiser.
 * admin     — Platform administrator. Full access to admin API.
 *
 * User security lock is NOT a status column — it uses `locked_until` timestamp.
 * A user with `locked_until > NOW()` cannot authenticate (brute-force protection).
 *
 * PAYMENT INTENT STATUS
 * ---------------------
 * pending   — Awaiting payment provider confirmation.
 * approved  — Payment confirmed. Benefits applied.
 * rejected  — Payment declined by provider.
 * canceled  — Canceled by user or system.
 */

export const AD_STATUS = Object.freeze({
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  PAUSED: "paused",
  SOLD: "sold",
  EXPIRED: "expired",
  REJECTED: "rejected",
  DELETED: "deleted",
  BLOCKED: "blocked",
});

/**
 * Listas derivadas — todo filtro/guard de status DEVE consumir uma destas em
 * vez de literais. Mantenha alinhado às regras de produto.
 *
 * AD_STATUS_PUBLIC ............ aparece em /comprar, sitemap, vitrines, busca
 *                              pública, autocomplete e qualquer feed externo.
 * AD_STATUS_OWNER_OPERABLE .... estados que o dono pode visualizar/editar no
 *                              dashboard. PENDING_REVIEW é incluído para que
 *                              o badge "Em análise" apareça; REJECTED é
 *                              incluído para que o dono possa reenviar.
 *                              DRAFT entra para suportar fluxo de correção
 *                              admin → dono.
 * AD_STATUS_CAN_RECEIVE_BOOST . SOMENTE ACTIVE pode comprar/aplicar destaque.
 * AD_STATUS_REQUIRES_ADMIN_ACTION  estados que travam o anúncio aguardando
 *                              decisão administrativa (lista da fila de
 *                              moderação).
 * AD_STATUS_OWNER_HIDDEN_FROM_PUBLIC  todos os estados em que o dono ainda
 *                              é dono mas o ad não aparece publicamente.
 */
export const AD_STATUS_PUBLIC = Object.freeze([AD_STATUS.ACTIVE]);

export const AD_STATUS_OWNER_OPERABLE = Object.freeze([
  AD_STATUS.DRAFT,
  AD_STATUS.PENDING_REVIEW,
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.REJECTED,
  AD_STATUS.SOLD,
]);

export const AD_STATUS_CAN_RECEIVE_BOOST = Object.freeze([AD_STATUS.ACTIVE]);

export const AD_STATUS_REQUIRES_ADMIN_ACTION = Object.freeze([
  AD_STATUS.PENDING_REVIEW,
]);

export const AD_STATUS_OWNER_HIDDEN_FROM_PUBLIC = Object.freeze([
  AD_STATUS.DRAFT,
  AD_STATUS.PENDING_REVIEW,
  AD_STATUS.PAUSED,
  AD_STATUS.SOLD,
  AD_STATUS.EXPIRED,
  AD_STATUS.REJECTED,
  AD_STATUS.BLOCKED,
]);

// Compat: nome legado mantido para callers existentes (busca pública).
export const AD_VISIBLE_STATUSES = AD_STATUS_PUBLIC;

export const AD_OWNER_VISIBLE_STATUSES = Object.freeze([
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.PENDING_REVIEW,
  AD_STATUS.REJECTED,
  AD_STATUS.SOLD,
  AD_STATUS.BLOCKED,
]);

export const AD_NON_DELETED_STATUSES = Object.freeze([
  AD_STATUS.DRAFT,
  AD_STATUS.PENDING_REVIEW,
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.SOLD,
  AD_STATUS.EXPIRED,
  AD_STATUS.REJECTED,
  AD_STATUS.BLOCKED,
]);

/** Severidade de risco antifraude (alinhada a ad_risk_signals.severity). */
export const AD_RISK_LEVEL = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

export const AD_RISK_LEVEL_VALUES = Object.freeze(Object.values(AD_RISK_LEVEL));

export const ADVERTISER_STATUS = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  BLOCKED: "blocked",
});

export const USER_ROLE = Object.freeze({
  USER: "user",
  ADMIN: "admin",
});

export const PAYMENT_INTENT_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELED: "canceled",
});

export const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: "active",
  EXPIRED: "expired",
  CANCELED: "canceled",
  PENDING: "pending",
});

export function isValidAdStatus(status) {
  return Object.values(AD_STATUS).includes(status);
}

export function isValidAdvertiserStatus(status) {
  return Object.values(ADVERTISER_STATUS).includes(status);
}

export function isValidUserRole(role) {
  return Object.values(USER_ROLE).includes(role);
}
