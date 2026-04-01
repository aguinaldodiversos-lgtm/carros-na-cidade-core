/**
 * Constantes canônicas de status de anúncio.
 * Use estes valores em todo o código — nunca strings literais dispersas.
 */

export const AD_STATUS = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  DELETED: "deleted",
  PENDING: "pending",
});

export const PUBLIC_VISIBLE_STATUSES = Object.freeze([AD_STATUS.ACTIVE]);
export const DASHBOARD_VISIBLE_STATUSES = Object.freeze([AD_STATUS.ACTIVE, AD_STATUS.PAUSED]);

export function isPubliclyVisible(status) {
  return status === AD_STATUS.ACTIVE;
}

export function isDashboardVisible(status) {
  return status === AD_STATUS.ACTIVE || status === AD_STATUS.PAUSED;
}
