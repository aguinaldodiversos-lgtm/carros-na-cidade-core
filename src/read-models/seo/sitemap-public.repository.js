import { pool } from "../../infrastructure/database/db.js";
import {
  SITEMAP_ELIGIBLE_SCP_STATUSES,
  sqlInLiteral,
} from "../../modules/seo/constants/seo-status.js";

const SCP_STATUS_FILTER = sqlInLiteral(SITEMAP_ELIGIBLE_SCP_STATUSES);

export async function listSitemapByType(type, limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      scp.path,
      scp.updated_at,
      scp.priority,
      scp.cluster_type,
      scp.stage,
      scp.money_page,
      c.state
    FROM seo_cluster_plans scp
    JOIN cities c ON c.id = scp.city_id
    WHERE scp.status ${SCP_STATUS_FILTER}
      AND scp.cluster_type = $1
    ORDER BY scp.priority DESC, scp.updated_at DESC
    LIMIT $2
    `,
    [type, safeLimit]
  );

  return result.rows;
}

export async function listSitemapByRegion(state, limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      scp.path,
      scp.updated_at,
      scp.priority,
      scp.cluster_type,
      scp.stage,
      scp.money_page,
      c.state
    FROM seo_cluster_plans scp
    JOIN cities c ON c.id = scp.city_id
    WHERE scp.status ${SCP_STATUS_FILTER}
      AND c.state = $1
    ORDER BY scp.priority DESC, scp.updated_at DESC
    LIMIT $2
    `,
    [state, safeLimit]
  );

  return result.rows;
}

export async function listAllSitemapEntries(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const result = await pool.query(
    `
    SELECT
      scp.path,
      scp.updated_at,
      scp.priority,
      scp.cluster_type,
      scp.stage,
      scp.money_page,
      c.state
    FROM seo_cluster_plans scp
    JOIN cities c ON c.id = scp.city_id
    WHERE scp.status ${SCP_STATUS_FILTER}
    ORDER BY scp.priority DESC, scp.updated_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return result.rows;
}
