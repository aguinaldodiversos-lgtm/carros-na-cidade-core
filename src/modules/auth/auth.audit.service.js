import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

export async function logLoginAttempt({
  userId,
  ip,
  userAgent,
  success,
  requestId,
}) {
  try {
    await pool.query(
      `
      INSERT INTO login_logs (user_id, ip_address, user_agent, success)
      VALUES ($1, $2, $3, $4)
      `,
      [userId || null, ip || null, userAgent || null, success]
    );
  } catch (err) {
    logger.error(
      {
        ...buildDomainFields({
          action: "auth.login_audit.persist",
          result: "error",
          requestId,
          userId,
          errMessage: err?.message || String(err),
        }),
      },
      "[auth] falha ao persistir login_logs"
    );
  }
}
