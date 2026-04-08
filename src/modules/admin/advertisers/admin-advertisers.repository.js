import { query } from "../../../infrastructure/database/db.js";

export async function listAdvertisers({ limit = 50, offset = 0, status } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`adv.status = $${idx++}`);
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       adv.id, adv.name, adv.email, adv.phone, adv.company_name,
       adv.status, adv.plan, adv.user_id, adv.city_id,
       adv.suspended_at, adv.blocked_at, adv.status_reason,
       adv.created_at, adv.updated_at,
       u.role AS user_role, u.document_type, u.email AS user_email,
       COUNT(a.id) FILTER (WHERE a.status = 'active') AS active_ads_count,
       COUNT(a.id) FILTER (WHERE a.status != 'deleted') AS total_ads_count
     FROM advertisers adv
     LEFT JOIN users u ON u.id = adv.user_id
     LEFT JOIN ads a ON a.advertiser_id = adv.id
     ${where}
     GROUP BY adv.id, u.id
     ORDER BY adv.created_at DESC NULLS LAST
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM advertisers adv ${where}`,
    params
  );

  return {
    data: result.rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

export async function findById(id) {
  const result = await query(
    `SELECT
       adv.*,
       u.role AS user_role, u.document_type, u.email AS user_email,
       u.name AS user_name, u.plan AS user_plan
     FROM advertisers adv
     LEFT JOIN users u ON u.id = adv.user_id
     WHERE adv.id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateStatus(id, status, reason = null) {
  if (status === "active") {
    const result = await query(
      `UPDATE advertisers
       SET status = $2, updated_at = NOW(),
           suspended_at = NULL, blocked_at = NULL, status_reason = NULL
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return result.rows[0] || null;
  }

  const timestampCol = status === "suspended" ? "suspended_at" : "blocked_at";
  const result = await query(
    `UPDATE advertisers
     SET status = $2, updated_at = NOW(),
         ${timestampCol} = NOW(), status_reason = $3
     WHERE id = $1 RETURNING *`,
    [id, status, reason]
  );
  return result.rows[0] || null;
}

export async function getAdvertiserAds(advertiserId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT
       a.id, a.title, a.slug, a.status, a.price, a.city, a.state,
       a.brand, a.model, a.year, a.priority, a.highlight_until,
       a.created_at, a.updated_at
     FROM ads a
     WHERE a.advertiser_id = $1
     ORDER BY a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [advertiserId, limit, offset]
  );
  return result.rows;
}
