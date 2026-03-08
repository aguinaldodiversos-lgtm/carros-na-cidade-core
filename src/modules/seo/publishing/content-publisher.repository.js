import { query } from "../../../infrastructure/database/db.js";

export async function upsertSeoPublication({
  clusterPlanId,
  path,
  title,
  content,
  excerpt = null,
  cityId = null,
  brand = null,
  model = null,
  publicationType = "cluster_page",
  contentProvider = null,
  contentStage = "discovery",
  isMoneyPage = false,
  status = "published",
  isIndexable = true,
  healthStatus = "healthy",
}) {
  const result = await query(
    `
    INSERT INTO seo_publications (
      cluster_plan_id,
      path,
      title,
      content,
      excerpt,
      city_id,
      brand,
      model,
      publication_type,
      content_provider,
      content_stage,
      is_money_page,
      is_indexable,
      health_status,
      status,
      published_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
    ON CONFLICT (path)
    DO UPDATE SET
      cluster_plan_id = EXCLUDED.cluster_plan_id,
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      excerpt = EXCLUDED.excerpt,
      city_id = EXCLUDED.city_id,
      brand = EXCLUDED.brand,
      model = EXCLUDED.model,
      publication_type = EXCLUDED.publication_type,
      content_provider = EXCLUDED.content_provider,
      content_stage = EXCLUDED.content_stage,
      is_money_page = EXCLUDED.is_money_page,
      is_indexable = EXCLUDED.is_indexable,
      health_status = EXCLUDED.health_status,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING *
    `,
    [
      clusterPlanId,
      path,
      title,
      content,
      excerpt,
      cityId,
      brand,
      model,
      publicationType,
      contentProvider,
      contentStage,
      Boolean(isMoneyPage),
      Boolean(isIndexable),
      healthStatus,
      status,
    ]
  );

  return result.rows[0];
}

export async function markClusterPublished(clusterPlanId) {
  await query(
    `
    UPDATE seo_cluster_plans
    SET
      status = 'published',
      last_generated_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    `,
    [clusterPlanId]
  );
}
