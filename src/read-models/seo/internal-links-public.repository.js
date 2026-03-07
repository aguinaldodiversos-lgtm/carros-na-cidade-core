import { pool } from "../../infrastructure/database/db.js";

export async function listInternalLinksByPath(path, limit = 200) {
  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 200));

  const result = await pool.query(
    `
    SELECT
      source_path,
      target_path,
      anchor_text,
      brand,
      model,
      link_type,
      score,
      updated_at
    FROM seo_internal_links
    WHERE source_path = $1
    ORDER BY score DESC, updated_at DESC
    LIMIT $2
    `,
    [path, safeLimit]
  );

  return result.rows;
}
