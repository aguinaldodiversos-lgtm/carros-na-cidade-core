import { pool } from "../../infrastructure/database/db.js";

export async function logLoginAttempt({
  userId,
  ip,
  userAgent,
  success,
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
    console.error("Erro ao registrar login log:", err.message);
  }
}
