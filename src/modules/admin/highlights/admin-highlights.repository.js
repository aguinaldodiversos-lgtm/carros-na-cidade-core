import { query } from "../../../infrastructure/database/db.js";

/**
 * Listagem de destaques com filtro derivado de `ads.highlight_until`.
 *
 * Modos:
 *   active   — highlight_until > NOW()
 *   expiring — highlight_until > NOW() AND highlight_until <= NOW() + interval (default 3 dias)
 *   expired  — highlight_until <= NOW() AND highlight_until IS NOT NULL
 *
 * Sempre exclui ads com status='deleted' (não faz sentido auditar destaque
 * de ad deletado na fila operacional).
 */
export async function list({
  mode = "active",
  city = undefined,
  advertiser_id = undefined,
  ad_id = undefined,
  expiring_days = 3,
  limit = 50,
  offset = 0,
} = {}) {
  const params = [];
  const conditions = ["a.status <> 'deleted'"];
  let idx = 1;

  if (mode === "active") {
    conditions.push("a.highlight_until > NOW()");
  } else if (mode === "expiring") {
    conditions.push(`a.highlight_until > NOW()`);
    conditions.push(`a.highlight_until <= NOW() + ($${idx++} || ' days')::interval`);
    params.push(String(expiring_days));
  } else if (mode === "expired") {
    conditions.push("a.highlight_until IS NOT NULL");
    conditions.push("a.highlight_until <= NOW()");
  }

  if (city) {
    conditions.push(`(LOWER(a.city) = LOWER($${idx}) OR LOWER(a.state) = LOWER($${idx}))`);
    params.push(city);
    idx++;
  }
  if (advertiser_id) {
    conditions.push(`a.advertiser_id = $${idx++}`);
    params.push(advertiser_id);
  }
  if (ad_id) {
    conditions.push(`a.id = $${idx++}`);
    params.push(ad_id);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const dataResult = await query(
    `SELECT
       a.id              AS ad_id,
       a.title           AS ad_title,
       a.slug            AS ad_slug,
       a.status          AS ad_status,
       a.city            AS ad_city,
       a.state           AS ad_state,
       a.price           AS ad_price,
       a.brand           AS ad_brand,
       a.model           AS ad_model,
       a.priority        AS ad_priority,
       a.highlight_until AS highlight_until,
       a.updated_at      AS ad_updated_at,
       adv.id            AS advertiser_id,
       adv.name          AS advertiser_name,
       u.plan_id         AS user_plan_id
     FROM ads a
     LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     LEFT JOIN users u ON u.id = adv.user_id
     ${where}
     ORDER BY a.highlight_until ${mode === "expired" ? "DESC" : "ASC"}
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM ads a
     LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     ${where}`,
    params
  );

  return {
    data: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

/**
 * Snapshot de contagens (active/expiring/expired) — KPI cards do admin.
 */
export async function summary({ expiring_days = 3 } = {}) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE a.highlight_until > NOW() AND a.status <> 'deleted')::int AS active,
       COUNT(*) FILTER (
         WHERE a.highlight_until > NOW()
           AND a.highlight_until <= NOW() + ($1 || ' days')::interval
           AND a.status <> 'deleted'
       )::int AS expiring,
       COUNT(*) FILTER (
         WHERE a.highlight_until IS NOT NULL
           AND a.highlight_until <= NOW()
           AND a.status <> 'deleted'
       )::int AS expired
     FROM ads a`,
    [String(expiring_days)]
  );
  return rows[0] || { active: 0, expiring: 0, expired: 0 };
}
