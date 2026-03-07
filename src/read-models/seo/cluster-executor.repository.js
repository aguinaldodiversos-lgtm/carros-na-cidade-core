import { pool } from "../../../infrastructure/database/db.js";

export async function listPendingClusterExecutions(limit = 500) {
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 500));

  const result = await pool.query(
    `
    SELECT
      scp.*,
      c.name AS city_name,
      c.state AS city_state,
      c.slug AS city_slug,
      cs.ranking_priority
    FROM seo_cluster_plans scp
    JOIN cities c ON c.id = scp.city_id
    LEFT JOIN city_scores cs ON cs.city_id = scp.city_id
    WHERE scp.status IN ('planned', 'generated')
    ORDER BY
      COALESCE(cs.ranking_priority, 0) DESC,
      scp.priority DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function markClusterExecutionInProgress(clusterPlanId) {
  await pool.query(
    `
    UPDATE seo_cluster_plans
    SET status = 'generating',
        updated_at = NOW()
    WHERE id = $1
    `,
    [clusterPlanId]
  );
}
