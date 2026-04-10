/**
 * Centralized feature flags for the Next.js frontend / BFF layer.
 *
 * Convention:
 *   - Each flag has a clear name, default, and purpose.
 *   - Environment variables are read once at module level.
 *   - For runtime checks, import the flag directly.
 *
 * For backend flags, see: src/shared/config/features.js
 */

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

export const featureFlags = {
  /**
   * Emit legacy image proxy URLs (/uploads/ads/...) in public API responses.
   * Default: false in production, true in dev.
   * Used by: backend `ads.public-images.js` (read via own env check).
   * Frontend mirror for awareness/documentation.
   */
  legacyImageProxy: envBool(
    "PUBLIC_EMIT_LEGACY_IMAGE_PROXY",
    process.env.NODE_ENV !== "production"
  ),

  /**
   * Enable request audit logging (middleware-level HTTP logs).
   * Default: false.
   */
  requestAuditLogs: envBool("REQUEST_AUDIT_LOGS_ENABLED", false),
} as const;
