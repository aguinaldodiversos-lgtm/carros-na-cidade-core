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

/**
 * Public CDN base URL for R2-hosted vehicle images. When set, the frontend
 * resolves `storage_key` straight to `${publicR2BaseUrl}/${key}` instead of
 * routing through `/api/vehicle-images?key=...` (which streams bytes via the
 * Render origin — what blew up outbound bandwidth in the 2026-05-13 incident).
 *
 * Mirrors backend `R2_PUBLIC_BASE_URL` but with the NEXT_PUBLIC_ prefix so
 * the value is inlined into the client bundle. Setting this is safe — it's
 * just the CDN URL, not credentials.
 */
function publicR2BaseUrl(): string {
  return (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
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

  /**
   * Public R2/CDN base URL for vehicle images. Empty string when not configured.
   */
  publicR2BaseUrl: publicR2BaseUrl(),

  /**
   * Allow `/api/vehicle-images` to stream image bytes through the Render origin
   * as a last-resort fallback. Default: false. When false, the route responds
   * with a 302 to the public R2 URL (if available) or to the SVG placeholder.
   *
   * Reativar apenas em incidente declarado de R2/CDN — costuma significar
   * pagar overage de outbound bandwidth no Render.
   */
  vehicleImageProxyFallback: envBool("VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED", false),

  /**
   * Stdout structured logs for every `/api/vehicle-images` request. Default: false.
   * Útil em janelas de diagnóstico após mudanças no caminho de imagem.
   */
  imageProxyDiagnostics: envBool("IMAGE_PROXY_DIAGNOSTICS_ENABLED", false),
} as const;
