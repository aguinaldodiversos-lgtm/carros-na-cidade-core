import { query } from "../../../infrastructure/database/db.js";

/**
 * Listagem paginada de denúncias com JOIN em ads + advertisers.
 * NÃO devolve reporter_ip_hash bruto — PII fica restrita à tabela.
 * Filtros opcionais aplicados com WHERE condicional.
 */
export async function list({
  status,
  reason,
  ad_id,
  q,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`r.status = $${idx++}`);
    params.push(status);
  }
  if (reason) {
    conditions.push(`r.reason = $${idx++}`);
    params.push(reason);
  }
  if (ad_id) {
    conditions.push(`r.ad_id = $${idx++}`);
    params.push(ad_id);
  }
  if (from) {
    conditions.push(`r.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`r.created_at <= $${idx++}`);
    params.push(to);
  }
  if (q) {
    conditions.push(
      `(a.title ILIKE $${idx} OR r.description ILIKE $${idx} OR adv.name ILIKE $${idx})`
    );
    params.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const dataResult = await query(
    `SELECT
       r.id,
       r.ad_id,
       r.reporter_user_id,
       r.reason,
       r.description,
       r.status,
       r.created_at,
       r.updated_at,
       a.title       AS ad_title,
       a.slug        AS ad_slug,
       a.status      AS ad_status,
       a.city        AS ad_city,
       a.state       AS ad_state,
       a.price       AS ad_price,
       adv.id        AS advertiser_id,
       adv.name      AS advertiser_name
     FROM ad_reports r
     LEFT JOIN ads a ON a.id = r.ad_id
     LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM ad_reports r
     LEFT JOIN ads a ON a.id = r.ad_id
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
 * Detalhe da denúncia com JOIN em ads + advertisers + imagem principal.
 * `images` é trazido como agregação leve (até 1 imagem por anúncio).
 */
export async function findById(id) {
  const { rows } = await query(
    `SELECT
       r.id,
       r.ad_id,
       r.reporter_user_id,
       r.reason,
       r.description,
       r.status,
       r.created_at,
       r.updated_at,
       a.title             AS ad_title,
       a.slug              AS ad_slug,
       a.status            AS ad_status,
       a.city              AS ad_city,
       a.state             AS ad_state,
       a.price             AS ad_price,
       a.brand             AS ad_brand,
       a.model             AS ad_model,
       a.year              AS ad_year,
       a.priority          AS ad_priority,
       a.highlight_until   AS ad_highlight_until,
       a.blocked_reason    AS ad_blocked_reason,
       adv.id              AS advertiser_id,
       adv.name            AS advertiser_name,
       adv.email           AS advertiser_email,
       adv.status          AS advertiser_status
     FROM ad_reports r
     LEFT JOIN ads a ON a.id = r.ad_id
     LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     WHERE r.id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * UPDATE status + updated_at. Caller já validou o newStatus contra a
 * lista canônica e contra a CHECK constraint do schema.
 */
export async function updateStatus(id, status) {
  const { rows } = await query(
    `UPDATE ad_reports
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, ad_id, reason, description, status, created_at, updated_at`,
    [id, status]
  );
  return rows[0] || null;
}

/**
 * Distribuição por status para o KPI da listagem. Inclui zeros explícitos
 * para garantir que todos os 4 buckets apareçam mesmo sem denúncia.
 */
export async function countByStatus() {
  const { rows } = await query(
    `SELECT status, COUNT(*)::int AS total
     FROM ad_reports
     GROUP BY status`
  );
  const base = { new: 0, in_review: 0, resolved: 0, dismissed: 0 };
  for (const row of rows) {
    if (row.status in base) base[row.status] = row.total;
  }
  return base;
}

/**
 * Histórico de ações administrativas sobre a denúncia, lido da própria
 * `admin_actions` (não há tabela paralela). Limit defensivo para evitar
 * resposta gigante quando uma denúncia gera muito churn.
 */
export async function findActionHistory(reportId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT
       aa.id,
       aa.admin_user_id,
       aa.action,
       aa.target_type,
       aa.target_id,
       aa.old_value,
       aa.new_value,
       aa.reason,
       aa.created_at,
       u.email AS admin_email,
       u.name  AS admin_name
     FROM admin_actions aa
     LEFT JOIN users u ON u.id::text = aa.admin_user_id
     WHERE aa.target_type = 'ad_report' AND aa.target_id = $1
     ORDER BY aa.id DESC
     LIMIT $2`,
    [String(reportId), limit]
  );
  return rows;
}
