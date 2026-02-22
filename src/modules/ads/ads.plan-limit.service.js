// src/modules/ads/ads.plan-limit.service.js

import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const PLAN_LIMITS = {
  free: 3,
  start: 20,
  pro: null, // ilimitado
};

export async function checkAdLimit(userId, userPlan) {
  const limit = PLAN_LIMITS[userPlan];

  if (limit === null) return;

  const result = await pool.query(
    `
    SELECT COUNT(*) FROM ads
    WHERE user_id = $1 AND status != 'deleted'
    `,
    [userId]
  );

  const count = parseInt(result.rows[0].count);

  if (count >= limit) {
    throw new AppError(
      "Limite de anúncios atingido para seu plano",
      403
    );
  }
}
