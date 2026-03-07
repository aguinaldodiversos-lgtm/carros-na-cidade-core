import { pool } from "../../../infrastructure/database/db.js";

export async function refreshStaleSeoPages(limit = 50) {
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50));

  const result = await pool.query(
    `
    SELECT id, title, city, brand, model, slug, updated_at
    FROM blog_posts
    WHERE status = 'published'
      AND updated_at < NOW() - INTERVAL '14 days'
    ORDER BY updated_at ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
