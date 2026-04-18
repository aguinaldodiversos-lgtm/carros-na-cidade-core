import { query } from "../../../infrastructure/database/db.js";

export async function listPaymentIntents({ limit = 50, offset = 0, status, context } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`pi.status = $${idx++}`);
    params.push(status);
  }
  if (context) {
    conditions.push(`pi.context = $${idx++}`);
    params.push(context);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await query(
      `SELECT
         pi.id, pi.user_id, pi.context, pi.plan_id, pi.ad_id,
         pi.boost_option_id, pi.amount, pi.status,
         pi.checkout_resource_type, pi.payment_resource_id,
         pi.created_at, pi.updated_at,
         u.name AS user_name, u.email AS user_email
       FROM payment_intents pi
       LEFT JOIN users u ON u.id = pi.user_id
       ${where}
       ORDER BY pi.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM payment_intents pi ${where}`,
      params
    );

    return {
      data: result.rows,
      total: countResult.rows[0]?.total || 0,
      limit,
      offset,
    };
  } catch {
    return {
      data: [],
      total: 0,
      limit,
      offset,
      _warning: "payment_intents table may not exist yet",
    };
  }
}

export async function getPaymentsSummary({ periodDays = 30 } = {}) {
  try {
    const result = await query(
      `SELECT
         COUNT(*)::int AS total_intents,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_count,
         COUNT(*) FILTER (WHERE status = 'canceled')::int AS canceled_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::numeric(12,2) AS total_approved_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric(12,2) AS total_pending_amount,
         COUNT(*) FILTER (WHERE context = 'plan' AND status = 'approved')::int AS plan_approved_count,
         COUNT(*) FILTER (WHERE context = 'boost' AND status = 'approved')::int AS boost_approved_count,
         COALESCE(SUM(amount) FILTER (WHERE context = 'plan' AND status = 'approved'), 0)::numeric(12,2) AS plan_approved_amount,
         COALESCE(SUM(amount) FILTER (WHERE context = 'boost' AND status = 'approved'), 0)::numeric(12,2) AS boost_approved_amount
       FROM payment_intents
       WHERE created_at >= NOW() - ($1 || ' days')::interval`,
      [String(periodDays)]
    );

    return result.rows[0] || null;
  } catch {
    return {
      total_intents: 0,
      approved_count: 0,
      pending_count: 0,
      rejected_count: 0,
      canceled_count: 0,
      total_approved_amount: 0,
      total_pending_amount: 0,
      plan_approved_count: 0,
      boost_approved_count: 0,
      plan_approved_amount: 0,
      boost_approved_amount: 0,
      _warning: "payment_intents table may not exist yet",
    };
  }
}
