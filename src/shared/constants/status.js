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
 * active    — Published and visible in the public catalog. Accepts leads.
 * paused    — Owner-initiated pause. Hidden from catalog but preserved.
 *             Owner can re-activate at any time.
 * deleted   — Soft-deleted by owner. Hidden everywhere. Cannot be restored
 *             via normal flow. Still exists in DB for audit/analytics.
 * blocked   — Administratively blocked (e.g. policy violation). Hidden from
 *             catalog. Owner sees "blocked" in dashboard. Only admin can unblock.
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
  ACTIVE: "active",
  PAUSED: "paused",
  DELETED: "deleted",
  BLOCKED: "blocked",
});

export const AD_VISIBLE_STATUSES = Object.freeze([AD_STATUS.ACTIVE]);

export const AD_OWNER_VISIBLE_STATUSES = Object.freeze([
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.BLOCKED,
]);

export const AD_NON_DELETED_STATUSES = Object.freeze([
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.BLOCKED,
]);

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
