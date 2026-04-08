import { query } from "../../../infrastructure/database/db.js";

export async function listAds({ limit = 50, offset = 0, status, city_id, advertiser_id } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`a.status = $${idx++}`);
    params.push(status);
  }
  if (city_id) {
    conditions.push(`a.city_id = $${idx++}`);
    params.push(city_id);
  }
  if (advertiser_id) {
    conditions.push(`a.advertiser_id = $${idx++}`);
    params.push(advertiser_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       a.id, a.title, a.slug, a.status, a.price, a.city, a.state,
       a.brand, a.model, a.year, a.plan, a.priority,
       a.highlight_until, a.created_at, a.updated_at,
       a.blocked_reason, a.blocked_at,
       adv.id AS advertiser_id, adv.name AS advertiser_name,
       adv.user_id AS advertiser_user_id
     FROM ads a
     LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     ${where}
     ORDER BY a.updated_at DESC NULLS LAST
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM ads a ${where}`,
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
       a.*,
       c.name AS city_name, c.slug AS city_slug,
       adv.id AS advertiser_id, adv.name AS advertiser_name,
       adv.email AS advertiser_email, adv.user_id AS advertiser_user_id,
       adv.status AS advertiser_status
     FROM ads a
     LEFT JOIN cities c ON c.id = a.city_id
     LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     WHERE a.id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateStatus(id, status) {
  const extra = status === "blocked"
    ? ", blocked_at = NOW()"
    : status === "active"
      ? ", blocked_at = NULL, blocked_reason = NULL"
      : "";

  const result = await query(
    `UPDATE ads SET status = $2, updated_at = NOW() ${extra} WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return result.rows[0] || null;
}

export async function updateHighlight(id, highlightUntil) {
  const result = await query(
    `UPDATE ads SET highlight_until = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, highlightUntil]
  );
  return result.rows[0] || null;
}

export async function updatePriority(id, priority) {
  const result = await query(
    `UPDATE ads SET priority = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, priority]
  );
  return result.rows[0] || null;
}

export async function updateBlockedReason(id, reason) {
  const result = await query(
    `UPDATE ads SET blocked_reason = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, reason]
  );
  return result.rows[0] || null;
}

export async function getAdMetrics(adId) {
  const result = await query(
    `SELECT * FROM ad_metrics WHERE ad_id = $1 LIMIT 1`,
    [adId]
  );
  return result.rows[0] || { ad_id: adId, views: 0, clicks: 0, leads: 0, ctr: 0 };
}

export async function getAdEvents(adId, { limit = 50 } = {}) {
  try {
    const result = await query(
      `SELECT * FROM ad_events WHERE ad_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [adId, limit]
    );
    return result.rows;
  } catch {
    return [];
  }
}
