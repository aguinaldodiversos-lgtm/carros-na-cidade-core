import { query } from "../../../infrastructure/database/db.js";

export async function createPublicationAudit({
  publicationId,
  clusterPlanId,
  path,
  auditStatus,
  issues,
  warnings,
  score,
}) {
  await query(
    `
    INSERT INTO seo_publication_audits
      (publication_id, cluster_plan_id, path, audit_status, issues, warnings, score, audited_at, created_at)
    VALUES
      ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW(), NOW())
    `,
    [
      publicationId || null,
      clusterPlanId || null,
      path,
      auditStatus,
      JSON.stringify(issues || []),
      JSON.stringify(warnings || []),
      score || 0,
    ]
  );
}

export async function updatePublicationHealth({ publicationId, isIndexable, healthStatus }) {
  await query(
    `
    UPDATE seo_publications
    SET
      is_indexable = $2,
      health_status = $3,
      updated_at = NOW()
    WHERE id = $1
    `,
    [publicationId, Boolean(isIndexable), healthStatus]
  );
}

export async function listPublicationsNeedingAudit(limit = 100) {
  const result = await query(
    `
    SELECT
      sp.id,
      sp.cluster_plan_id,
      sp.path,
      sp.title,
      sp.content,
      sp.excerpt
    FROM seo_publications sp
    LEFT JOIN LATERAL (
      SELECT spa.id
      FROM seo_publication_audits spa
      WHERE spa.publication_id = sp.id
      ORDER BY spa.audited_at DESC
      LIMIT 1
    ) last_audit ON true
    WHERE last_audit.id IS NULL
       OR sp.updated_at > NOW() - INTERVAL '2 days'
    ORDER BY sp.updated_at DESC
    LIMIT $1
    `,
    [limit]
  );

  return result.rows;
}
