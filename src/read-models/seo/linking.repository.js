import { pool } from "../../infrastructure/database/db.js";

export async function upsertInternalLink({
  sourcePath,
  targetPath,
  anchorText,
  cityId = null,
  brand = null,
  model = null,
  linkType = "contextual",
  score = 0,
}) {
  const result = await pool.query(
    `
    INSERT INTO seo_internal_links (
      source_path,
      target_path,
      anchor_text,
      city_id,
      brand,
      model,
      link_type,
      score,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
    ON CONFLICT (source_path, target_path, anchor_text)
    DO UPDATE SET
      city_id = EXCLUDED.city_id,
      brand = EXCLUDED.brand,
      model = EXCLUDED.model,
      link_type = EXCLUDED.link_type,
      score = EXCLUDED.score,
      updated_at = NOW()
    RETURNING *
    `,
    [
      sourcePath,
      targetPath,
      anchorText,
      cityId,
      brand,
      model,
      linkType,
      Number(score || 0),
    ]
  );

  return result.rows[0];
}

export async function listClusterPathsByCity(cityId) {
  const result = await pool.query(
    `
    SELECT id, path, cluster_type, brand, model, money_page, priority
    FROM seo_cluster_plans
    WHERE city_id = $1
      AND status IN ('planned', 'generated')
    ORDER BY priority DESC, path ASC
    `,
    [cityId]
  );

  return result.rows;
}
