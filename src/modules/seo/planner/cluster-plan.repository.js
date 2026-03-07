import { pool } from "../../../infrastructure/database/db.js";

export async function upsertClusterPlan({
  cityId,
  clusterType,
  path,
  brand = null,
  model = null,
  moneyPage = false,
  priority = 0,
  status = "planned",
  stage = "discovery",
  payload = {},
}) {
  const result = await pool.query(
    `
    INSERT INTO seo_cluster_plans (
      city_id,
      cluster_type,
      path,
      brand,
      model,
      money_page,
      priority,
      status,
      stage,
      payload,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
    ON CONFLICT (path)
    DO UPDATE SET
      city_id = EXCLUDED.city_id,
      cluster_type = EXCLUDED.cluster_type,
      brand = EXCLUDED.brand,
      model = EXCLUDED.model,
      money_page = EXCLUDED.money_page,
      priority = EXCLUDED.priority,
      status = EXCLUDED.status,
      stage = EXCLUDED.stage,
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING *
    `,
    [
      cityId,
      clusterType,
      path,
      brand,
      model,
      Boolean(moneyPage),
      Number(priority || 0),
      status,
      stage,
      JSON.stringify(payload || {}),
    ]
  );

  return result.rows[0];
}

export async function listClusterPlansByCity(cityId, limit = 500) {
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 500));

  const result = await pool.query(
    `
    SELECT *
    FROM seo_cluster_plans
    WHERE city_id = $1
    ORDER BY priority DESC, path ASC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}

export async function listTopClusterPlans(limit = 1000) {
  const safeLimit = Math.min(10000, Math.max(1, Number(limit) || 1000));

  const result = await pool.query(
    `
    SELECT scp.*, c.slug AS city_slug, c.name AS city_name
    FROM seo_cluster_plans scp
    JOIN cities c ON c.id = scp.city_id
    ORDER BY scp.priority DESC, scp.updated_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function markClusterPlanGenerated(clusterPlanId) {
  await pool.query(
    `
    UPDATE seo_cluster_plans
    SET
      status = 'generated',
      last_generated_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    `,
    [clusterPlanId]
  );
}
