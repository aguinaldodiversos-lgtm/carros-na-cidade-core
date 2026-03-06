import { pool } from "../../infrastructure/database/db.js";

export async function auditAiCall({
  logger,
  task,
  provider,
  model,
  latencyMs,
  cached,
  costUsdEstimate,
  tenantId,
  userId,
  requestId,
  ok,
  error,
}) {
  try {
    await pool.query(
      `
      INSERT INTO ai_audit_logs
        (task, provider, model, latency_ms, cached, cost_usd_estimate, tenant_id, user_id, request_id, ok, error, created_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      `,
      [
        task,
        provider,
        model || null,
        latencyMs || null,
        Boolean(cached),
        costUsdEstimate || 0,
        tenantId || null,
        userId || null,
        requestId || null,
        Boolean(ok),
        error || null,
      ]
    );
  } catch (err) {
    logger.debug(
      {
        error: err?.message || String(err),
      },
      "[brain.ai.audit] Audit skipped/fail"
    );
  }
}
