import { pool } from "../../infrastructure/database/db.js";

export async function createAutopilotCampaign({
  city_id,
  campaign_type,
  opportunity_score = 0,
  status = "pending",
}) {
  const result = await pool.query(
    `
    INSERT INTO autopilot_campaigns (
      city_id,
      campaign_type,
      opportunity_score,
      status,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING *
    `,
    [city_id, campaign_type, opportunity_score, status]
  );

  return result.rows[0];
}

export async function findActiveCampaignByCityAndType(cityId, campaignType) {
  const result = await pool.query(
    `
    SELECT *
    FROM autopilot_campaigns
    WHERE city_id = $1
      AND campaign_type = $2
      AND status IN ('pending', 'running')
    LIMIT 1
    `,
    [cityId, campaignType]
  );

  return result.rows[0] || null;
}

export async function listCampaignsByCity(cityId, limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const result = await pool.query(
    `
    SELECT *
    FROM autopilot_campaigns
    WHERE city_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [cityId, safeLimit]
  );

  return result.rows;
}

export async function enqueueGrowthJob({ job_type, payload, priority = 3 }) {
  await pool.query(
    `
    INSERT INTO growth_jobs (
      job_type,
      payload,
      priority,
      status,
      created_at,
      updated_at
    )
    SELECT $1, $2::jsonb, $3, 'pending', NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM growth_jobs
      WHERE job_type = $1
        AND payload = $2::jsonb
        AND status IN ('pending', 'running')
    )
    `,
    [job_type, JSON.stringify(payload), priority]
  );
}
