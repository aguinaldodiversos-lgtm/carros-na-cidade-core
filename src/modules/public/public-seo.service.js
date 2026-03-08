import { query } from "../../infrastructure/database/db.js";

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return 10000;
  return Math.max(1, Math.min(50000, Math.floor(n)));
}

function buildPriority(clusterType, moneyPage) {
  if (moneyPage) return 0.9;
  if (clusterType === "city_home") return 0.8;
  if (clusterType === "city_brand_model") return 0.7;
  if (clusterType === "city_brand") return 0.6;
  if (clusterType === "city_opportunities") return 0.7;
  if (clusterType === "city_below_fipe") return 0.7;
  return 0.5;
}

function buildChangefreq(clusterType) {
  if (clusterType === "city_home") return "daily";
  if (clusterType === "city_opportunities") return "daily";
  if (clusterType === "city_below_fipe") return "daily";
  return "weekly";
}

function mapEntry(row) {
  const clusterType = row.cluster_type || "unknown";
  const moneyPage = Boolean(row.money_page);

  return {
    loc: row.loc,
    lastmod: row.lastmod,
    changefreq: buildChangefreq(clusterType),
    priority: buildPriority(clusterType, moneyPage),
    clusterType,
    stage: row.stage || "discovery",
    moneyPage,
    state: row.state || null,
  };
}

async function listEntries({ limit = 10000, type = null, state = null } = {}) {
  const safeLimit = clampLimit(limit);
  const conditions = [
    `scp.path IS NOT NULL`,
    `scp.status IN ('published', 'planned')`,
    `(sp.id IS NULL OR sp.is_indexable = TRUE)`,
    `(sp.id IS NULL OR sp.status IN ('published', 'review_required'))`,
  ];

  const params = [];
  let index = 1;

  if (type) {
    conditions.push(`scp.cluster_type = $${index++}`);
    params.push(type);
  }

  if (state) {
    conditions.push(`c.state = $${index++}`);
    params.push(String(state).trim().toUpperCase());
  }

  params.push(safeLimit);

  const result = await query(
    `
    SELECT
      scp.path AS loc,
      COALESCE(sp.updated_at, sp.published_at, scp.last_generated_at, scp.updated_at, scp.created_at) AS lastmod,
      scp.cluster_type,
      scp.stage,
      scp.money_page,
      c.state
    FROM seo_cluster_plans scp
    LEFT JOIN seo_publications sp
      ON sp.cluster_plan_id = scp.id
    LEFT JOIN cities c
      ON c.id = scp.city_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY
      COALESCE(sp.updated_at, sp.published_at, scp.last_generated_at, scp.updated_at, scp.created_at) DESC,
      scp.path ASC
    LIMIT $${index}
    `,
    params
  );

  return result.rows.map(mapEntry);
}

export async function listPublicSitemapEntries({ limit = 10000 } = {}) {
  return listEntries({ limit });
}

export async function listPublicSitemapEntriesByType(type, { limit = 10000 } = {}) {
  return listEntries({ type, limit });
}

export async function listPublicSitemapEntriesByRegion(state, { limit = 10000 } = {}) {
  return listEntries({ state, limit });
}
