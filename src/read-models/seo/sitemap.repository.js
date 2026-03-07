import { pool } from "../../infrastructure/database/db.js";

export async function listSitemapEntries(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      scp.path,
      scp.updated_at,
      scp.priority,
      scp.cluster_type,
      scp.stage,
      scp.money_page
    FROM seo_cluster_plans scp
    WHERE scp.status IN ('planned', 'generated')
    ORDER BY scp.priority DESC, scp.updated_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
