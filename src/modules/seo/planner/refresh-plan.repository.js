import { pool } from "../../../infrastructure/database/db.js";

export async function upsertRefreshPlan({
  clusterPlanId,
  refreshReason = "stage_policy",
  refreshIntervalHours = 168,
  nextRefreshAt,
  status = "scheduled",
}) {
  const result = await pool.query(
    `
    INSERT INTO seo_refresh_plans (
      cluster_plan_id,
      refresh_reason,
      refresh_interval_hours,
      next_refresh_at,
      status,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
    ON CONFLICT (cluster_plan_id)
    DO UPDATE SET
      refresh_reason = EXCLUDED.refresh_reason,
      refresh_interval_hours = EXCLUDED.refresh_interval_hours,
      next_refresh_at = EXCLUDED.next_refresh_at,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING *
    `,
    [clusterPlanId, refreshReason, Number(refreshIntervalHours || 168), nextRefreshAt, status]
  );

  return result.rows[0];
}

export async function listDueRefreshPlans(limit = 500) {
  const safeLimit = Math.min(5000, Math.max(1, Number(limit) || 500));

  const result = await pool.query(
    `
    SELECT srp.*, scp.path, scp.city_id, scp.cluster_type, scp.stage, scp.priority
    FROM seo_refresh_plans srp
    JOIN seo_cluster_plans scp ON scp.id = srp.cluster_plan_id
    WHERE srp.status = 'scheduled'
      AND srp.next_refresh_at IS NOT NULL
      AND srp.next_refresh_at <= NOW()
    ORDER BY scp.priority DESC, srp.next_refresh_at ASC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}

export async function markRefreshExecuted(id, nextRefreshAt) {
  await pool.query(
    `
    UPDATE seo_refresh_plans
    SET
      last_refresh_at = NOW(),
      next_refresh_at = $2,
      status = 'scheduled',
      updated_at = NOW()
    WHERE id = $1
    `,
    [id, nextRefreshAt]
  );
}
