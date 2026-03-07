import { pool } from "../../infrastructure/database/db.js";

export async function listTopMoneyPageCandidates(limit = 200) {
  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 200));

  const result = await pool.query(
    `
    SELECT
      scp.id AS cluster_plan_id,
      scp.city_id,
      scp.path,
      scp.cluster_type,
      scp.brand,
      scp.model,
      scp.stage,
      scp.priority,
      scp.money_page,
      c.name AS city_name,
      c.state AS city_state,
      c.slug AS city_slug,
      cs.ranking_priority,
      cs.territorial_score
    FROM seo_cluster_plans scp
    JOIN cities c ON c.id = scp.city_id
    LEFT JOIN city_scores cs ON cs.city_id = scp.city_id
    WHERE scp.money_page = true
      AND scp.status IN ('planned', 'generated')
    ORDER BY
      COALESCE(cs.ranking_priority, 0) DESC,
      COALESCE(scp.priority, 0) DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function getMoneyPageByPath(path) {
  const result = await pool.query(
    `
    SELECT
      sp.*,
      c.name AS city_name,
      c.state AS city_state,
      c.slug AS city_slug
    FROM seo_publications sp
    LEFT JOIN cities c ON c.id = sp.city_id
    WHERE sp.path = $1
      AND sp.is_money_page = true
      AND sp.status = 'published'
    LIMIT 1
    `,
    [path]
  );

  return result.rows[0] || null;
}
