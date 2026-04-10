/**
 * Centralized feature flags for the Express backend.
 *
 * Convention:
 *   - Each flag has a clear name, default value, and documented purpose.
 *   - Env vars are resolved once at import time.
 *   - Import `features` wherever you need a runtime check.
 *
 * For frontend flags, see: frontend/lib/config/feature-flags.ts
 */

function envBool(key, fallback) {
  const v = process.env[key];
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

export const features = {
  /** Background banner worker (generates promotional images). Default: off. */
  bannerWorkerEnabled: envBool("ENABLE_BANNER_WORKER", false),

  /** Local AI inference (Ollama / local models). Default: on. */
  localAIEnabled: envBool("LOCAL_AI_ENABLED", true),

  /** Premium AI (OpenAI / external paid models). Default: off. */
  premiumAIEnabled: envBool("PREMIUM_AI_ENABLED", false),

  /** Master AI toggle. Default: off. */
  aiEnabled: envBool("AI_ENABLED", false),

  /** Emit legacy image proxy URLs in public API. Default: off in prod, on in dev. */
  legacyImageProxy: envBool(
    "PUBLIC_EMIT_LEGACY_IMAGE_PROXY",
    process.env.NODE_ENV !== "production"
  ),

  /** HTTP request audit logs. Default: off. */
  requestAuditLogs: envBool("REQUEST_AUDIT_LOGS_ENABLED", false),

  /** Serve static /uploads directory. Default: true in dev. */
  serveUploadsStatic: envBool("SERVE_UPLOADS_STATIC", process.env.NODE_ENV !== "production"),

  /** Disable Redis entirely (cache + queues). Default: false. */
  disableRedis: envBool("DISABLE_REDIS", false),

  /** Auto-run DB migrations on startup. Default: false. */
  runMigrations: envBool("RUN_MIGRATIONS", false),

  /** Start background workers on startup. Default: false. */
  runWorkers: envBool("RUN_WORKERS", false),
};
