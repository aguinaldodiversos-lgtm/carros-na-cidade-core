import { query } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

/**
 * Records an admin action for audit trail.
 * Designed to never throw — failures are logged but do not block the operation.
 */
export async function recordAdminAction({
  adminUserId,
  action,
  targetType,
  targetId,
  oldValue = null,
  newValue = null,
  reason = null,
}) {
  try {
    await query(
      `INSERT INTO admin_actions (admin_user_id, action, target_type, target_id, old_value, new_value, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
      [
        String(adminUserId),
        action,
        targetType,
        String(targetId),
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        reason,
      ]
    );
  } catch (err) {
    logger.error(
      { err: err?.message, adminUserId, action, targetType, targetId },
      "[admin.audit] failed to record action"
    );
  }
}
