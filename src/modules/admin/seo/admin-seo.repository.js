import { query } from "../../../infrastructure/database/db.js";

/**
 * Introspeccao do schema real de `seo_publications` em runtime.
 *
 * MOTIVACAO: a tabela foi criada out-of-band em producao (migration 022
 * documenta isso explicitamente — so adicionou is_indexable). O conjunto
 * efetivo de colunas em prod NAO bate 100% com content-publisher.repository.js
 * (que tenta INSERT colunas como health_status/content_provider/...). O pipeline
 * de publicacao esta dormente, entao esse INSERT nunca rodou; o desvio ficou
 * invisivel ate o admin-seo SELECT bater.
 *
 * CONTRATO: na primeira chamada, descobre quais colunas existem e cacheia
 * por processo. Builds dinamicos abaixo usam `colExpr()` para emitir
 * `<col>` ou `NULL::<type> AS <col>` conforme presenca real.
 */
let _seoColsPromise = null;
async function getSeoPublicationColumns() {
  if (_seoColsPromise) return _seoColsPromise;
  _seoColsPromise = (async () => {
    try {
      const { rows } = await query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'seo_publications'`
      );
      return new Set(rows.map((r) => r.column_name));
    } catch {
      _seoColsPromise = null;
      return new Set();
    }
  })();
  return _seoColsPromise;
}

// Helpers para SELECT defensivo
function colExpr(cols, name, nullType = "text") {
  return cols.has(name) ? `sp.${name}` : `NULL::${nullType} AS ${name}`;
}
function whereExpr(cols, name) {
  return cols.has(name) ? `sp.${name}` : null;
}

/**
 * Lista paginada de publicações SEO com JOINs em cluster_plans + cities.
 * Toda referencia a colunas opcionais (`health_status`, `is_money_page`,
 * `content_provider`, `content_stage`) e emitida defensivamente via
 * `colExpr()` — em prod, onde algumas dessas colunas nao existem, o SELECT
 * devolve NULL e a UI mostra "—".
 *
 * NÃO usa SELECT *. Filtros sao todos condicionais.
 */
export async function listPublications({
  status,
  publication_type,
  is_indexable,
  has_error,
  uf,
  city,
  q,
  limit = 50,
  offset = 0,
} = {}) {
  const cols = await getSeoPublicationColumns();
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status && cols.has("status")) {
    conditions.push(`sp.status = $${idx++}`);
    params.push(status);
  }
  if (publication_type && cols.has("publication_type")) {
    conditions.push(`sp.publication_type = $${idx++}`);
    params.push(publication_type);
  }
  if (is_indexable === true && cols.has("is_indexable")) {
    conditions.push(`sp.is_indexable = TRUE`);
  } else if (is_indexable === false && cols.has("is_indexable")) {
    conditions.push(`sp.is_indexable = FALSE`);
  }
  if (has_error === true && cols.has("health_status")) {
    conditions.push(`(sp.health_status IS NOT NULL AND sp.health_status NOT IN ('healthy','ok'))`);
  }
  if (uf) {
    conditions.push(`UPPER(c.state) = UPPER($${idx++})`);
    params.push(uf);
  }
  if (city) {
    conditions.push(`(c.slug = $${idx} OR LOWER(c.name) = LOWER($${idx}))`);
    params.push(city);
    idx++;
  }
  if (q && cols.has("title") && cols.has("path")) {
    conditions.push(`(sp.title ILIKE $${idx} OR sp.path ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const dataResult = await query(
    `SELECT
       sp.id,
       sp.path,
       sp.title,
       ${colExpr(cols, "excerpt", "text")},
       ${colExpr(cols, "publication_type", "text")},
       ${colExpr(cols, "content_provider", "text")},
       ${colExpr(cols, "content_stage", "text")},
       ${colExpr(cols, "status", "text")},
       ${cols.has("is_indexable") ? "sp.is_indexable" : "TRUE::boolean AS is_indexable"},
       ${colExpr(cols, "is_money_page", "boolean")},
       ${colExpr(cols, "health_status", "text")},
       ${colExpr(cols, "cluster_plan_id", "bigint")},
       ${colExpr(cols, "city_id", "bigint")},
       ${colExpr(cols, "brand", "text")},
       ${colExpr(cols, "model", "text")},
       ${colExpr(cols, "published_at", "timestamptz")},
       sp.updated_at,
       ${colExpr(cols, "created_at", "timestamptz")},
       c.slug AS city_slug,
       c.name AS city_name,
       c.state AS city_state,
       ${cols.has("content") ? "COALESCE(LENGTH(sp.content), 0)" : "0"} AS content_length
     FROM seo_publications sp
     LEFT JOIN cities c ON c.id = ${cols.has("city_id") ? "sp.city_id" : "NULL"}
     ${where}
     ORDER BY sp.updated_at DESC NULLS LAST, sp.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*)::int AS total
     FROM seo_publications sp
     LEFT JOIN cities c ON c.id = ${cols.has("city_id") ? "sp.city_id" : "NULL"}
     ${where}`,
    params
  );

  return {
    data: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

export async function findPublicationById(id) {
  const cols = await getSeoPublicationColumns();
  const { rows } = await query(
    `SELECT
       sp.id,
       sp.path,
       sp.title,
       ${colExpr(cols, "content", "text")},
       ${colExpr(cols, "excerpt", "text")},
       ${colExpr(cols, "publication_type", "text")},
       ${colExpr(cols, "content_provider", "text")},
       ${colExpr(cols, "content_stage", "text")},
       ${colExpr(cols, "status", "text")},
       ${cols.has("is_indexable") ? "sp.is_indexable" : "TRUE::boolean AS is_indexable"},
       ${colExpr(cols, "is_money_page", "boolean")},
       ${colExpr(cols, "health_status", "text")},
       ${colExpr(cols, "cluster_plan_id", "bigint")},
       ${colExpr(cols, "city_id", "bigint")},
       ${colExpr(cols, "brand", "text")},
       ${colExpr(cols, "model", "text")},
       ${colExpr(cols, "published_at", "timestamptz")},
       sp.updated_at,
       ${colExpr(cols, "created_at", "timestamptz")},
       c.slug AS city_slug,
       c.name AS city_name,
       c.state AS city_state,
       ${cols.has("content") ? "COALESCE(LENGTH(sp.content), 0)" : "0"} AS content_length
     FROM seo_publications sp
     LEFT JOIN cities c ON c.id = ${cols.has("city_id") ? "sp.city_id" : "NULL"}
     WHERE sp.id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Histórico recente de audits da publicacao + acoes em admin_actions.
 * Quem nao tiver audit table responde [].
 */
export async function findPublicationAudits(publicationId, { limit = 20 } = {}) {
  try {
    const { rows } = await query(
      `SELECT id, publication_id, audit_status, issues, warnings, score, audited_at
       FROM seo_publication_audits
       WHERE publication_id = $1
       ORDER BY audited_at DESC
       LIMIT $2`,
      [publicationId, limit]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function findAdminActionHistory(publicationId, { limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT
       aa.id, aa.admin_user_id, aa.action, aa.target_type, aa.target_id,
       aa.old_value, aa.new_value, aa.reason, aa.created_at,
       u.email AS admin_email, u.name AS admin_name
     FROM admin_actions aa
     LEFT JOIN users u ON u.id::text = aa.admin_user_id
     WHERE aa.target_type = 'seo_publication' AND aa.target_id = $1
     ORDER BY aa.id DESC
     LIMIT $2`,
    [String(publicationId), limit]
  );
  return rows;
}

/**
 * UPDATE parcial. Caller validou cada campo. Atualiza updated_at sempre.
 * Pula campos cuja coluna nao existe no schema real (defensivo).
 */
export async function updatePublication(id, patch) {
  const cols = await getSeoPublicationColumns();
  const sets = [];
  const params = [];
  let idx = 1;
  const fields = ["title", "is_indexable", "health_status", "status"];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && cols.has(field)) {
      sets.push(`${field} = $${idx++}`);
      params.push(patch[field]);
    }
  }
  if (!sets.length) return findPublicationById(id);
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(
    `UPDATE seo_publications SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`,
    params
  );
  if (!rows[0]) return null;
  return findPublicationById(id);
}

/**
 * Numero canonico para os KPI cards. Tudo em uma query agregada — sem
 * round-trip por contador. Cada FILTER e condicional sobre presenca da
 * coluna no schema real (defensivo).
 */
export async function overviewSummary() {
  const cols = await getSeoPublicationColumns();
  const statusFilter = cols.has("status")
    ? `COUNT(*) FILTER (WHERE status = 'published')::int AS published,
       COUNT(*) FILTER (WHERE status = 'planned')::int AS planned,`
    : `0::int AS published, 0::int AS planned,`;
  const healthFilter = cols.has("health_status")
    ? `COUNT(*) FILTER (WHERE health_status IS NOT NULL AND health_status NOT IN ('healthy','ok'))::int AS with_error,`
    : `0::int AS with_error,`;
  const indexableFilter = cols.has("is_indexable")
    ? `COUNT(*) FILTER (WHERE is_indexable = TRUE)::int AS indexable,
       COUNT(*) FILTER (WHERE is_indexable = FALSE)::int AS non_indexable,`
    : `0::int AS indexable, 0::int AS non_indexable,`;
  const { rows } = await query(
    `WITH pub AS (
       SELECT
         COUNT(*)::int AS total,
         ${statusFilter}
         ${healthFilter}
         ${indexableFilter}
         MAX(updated_at) AS last_publication_update
       FROM seo_publications
     ),
     clusters AS (
       SELECT
         COUNT(*)::int AS total_clusters,
         COUNT(*) FILTER (WHERE status IN ('planned','generated'))::int AS sitemap_eligible_clusters,
         MAX(updated_at) AS last_cluster_update
       FROM seo_cluster_plans
     ),
     regions AS (
       SELECT COUNT(DISTINCT state)::int AS active_states
       FROM cities
       WHERE EXISTS (
         SELECT 1 FROM ads a
         WHERE a.city_id = cities.id AND a.status = 'active'
       )
     ),
     cities_with_ads AS (
       SELECT COUNT(DISTINCT city_id)::int AS total
       FROM ads
       WHERE status = 'active' AND city_id IS NOT NULL
     )
     SELECT
       pub.total, pub.published, pub.planned, pub.with_error,
       pub.indexable, pub.non_indexable,
       pub.last_publication_update,
       clusters.total_clusters, clusters.sitemap_eligible_clusters,
       clusters.last_cluster_update,
       regions.active_states,
       cities_with_ads.total AS cities_with_ads
     FROM pub, clusters, regions, cities_with_ads`
  );
  return rows[0] || null;
}

/**
 * Contagem aproximada de URLs por sitemap baseada em seo_cluster_plans
 * agrupado por cluster_type. Os 9 arquivos físicos em
 * frontend/app/sitemaps/ consomem isso (via listSitemapByType/Region).
 */
export async function sitemapCounts() {
  const { rows } = await query(
    `SELECT
       cluster_type,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('planned','generated'))::int AS eligible,
       MAX(updated_at) AS last_update
     FROM seo_cluster_plans
     GROUP BY cluster_type
     ORDER BY cluster_type`
  );
  return rows;
}

/**
 * Cidades distintas com cluster_plans gerados por estado — usado para
 * o sitemap /sitemaps/regiao/[state].xml.
 */
export async function sitemapRegionCounts() {
  const { rows } = await query(
    `SELECT
       c.state,
       COUNT(*)::int AS total,
       MAX(scp.updated_at) AS last_update
     FROM seo_cluster_plans scp
     JOIN cities c ON c.id = scp.city_id
     WHERE scp.status IN ('planned','generated')
     GROUP BY c.state
     ORDER BY c.state`
  );
  return rows;
}

/**
 * Lista canonica de "problemas" — auditoria leve.
 * Cada linha vira um item na aba Problemas com severidade.
 *
 * As consultas que dependem de colunas opcionais sao puladas quando a
 * coluna nao existe (em prod sem health_status etc., a categoria
 * 'unhealthy_status' simplesmente nao aparece — sem erro 500).
 */
export async function listIssues({ limit = 100 } = {}) {
  const cols = await getSeoPublicationColumns();
  const issues = [];

  // 1. Publicacao indexavel sem conteudo (critico) — so se temos is_indexable + content
  if (cols.has("is_indexable") && cols.has("content")) {
    const ptypeCol = cols.has("publication_type") ? "publication_type" : "NULL AS publication_type";
    const noContent = await query(
      `SELECT id, path, title, ${ptypeCol}, updated_at
       FROM seo_publications
       WHERE is_indexable = TRUE
         AND (content IS NULL OR LENGTH(content) < 100)
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    for (const row of noContent.rows) {
      issues.push({
        severity: "critical",
        kind: "indexable_without_content",
        title: "Publicação indexável sem conteúdo",
        detail: `Path: ${row.path} (id=${row.id})`,
        publication_id: row.id,
        path: row.path,
        publication_type: row.publication_type,
      });
    }
  }

  // 2. Publicacao com health_status nao saudavel (alto) — so se a coluna existe
  if (cols.has("health_status")) {
    const unhealthy = await query(
      `SELECT id, path, title, health_status, updated_at
       FROM seo_publications
       WHERE health_status IS NOT NULL
         AND health_status NOT IN ('healthy','ok')
       ORDER BY updated_at DESC NULLS LAST
       LIMIT $1`,
      [limit]
    );
    for (const row of unhealthy.rows) {
      issues.push({
        severity: "high",
        kind: "unhealthy_status",
        title: `Publicação com health_status=${row.health_status}`,
        detail: `Path: ${row.path} (id=${row.id})`,
        publication_id: row.id,
        path: row.path,
        health_status: row.health_status,
      });
    }
  }

  // 3. Sitemap vazio (cluster_type sem nenhum cluster elegivel) — alto
  const sitemapBuckets = ["city", "below_fipe", "brands", "models", "opportunities", "local_seo"];
  const counts = await sitemapCounts();
  const countsByType = Object.fromEntries(counts.map((r) => [r.cluster_type, r.eligible]));
  for (const bucket of sitemapBuckets) {
    if (!countsByType[bucket] || countsByType[bucket] === 0) {
      issues.push({
        severity: "high",
        kind: "empty_sitemap_bucket",
        title: `Sitemap bucket vazio: ${bucket}`,
        detail: `seo_cluster_plans sem cluster_type='${bucket}' elegível (status IN planned/generated).`,
      });
    }
  }

  // 4. Cluster planejado mas sem publicacao correspondente (medio)
  const planNoPub = await query(
    `SELECT scp.id, scp.path, scp.cluster_type, scp.status, scp.updated_at
     FROM seo_cluster_plans scp
     LEFT JOIN seo_publications sp ON sp.cluster_plan_id = scp.id
     WHERE scp.status IN ('planned','generated')
       AND sp.id IS NULL
     ORDER BY scp.priority DESC, scp.updated_at DESC
     LIMIT $1`,
    [limit]
  );
  for (const row of planNoPub.rows) {
    issues.push({
      severity: "medium",
      kind: "cluster_without_publication",
      title: "Plano de cluster sem publicação",
      detail: `Path: ${row.path} (cluster_type=${row.cluster_type}, status=${row.status})`,
      cluster_plan_id: row.id,
      path: row.path,
    });
  }

  // 5. Publicacao explicitamente noindex (baixo — informativo)
  if (cols.has("is_indexable")) {
    const explicitNoindex = await query(
      `SELECT id, path, title, updated_at
       FROM seo_publications
       WHERE is_indexable = FALSE
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 25`
    );
    for (const row of explicitNoindex.rows) {
      issues.push({
        severity: "low",
        kind: "noindex_explicit",
        title: "Publicação marcada como não-indexável",
        detail: `Path: ${row.path} (id=${row.id})`,
        publication_id: row.id,
        path: row.path,
      });
    }
  }

  return issues.slice(0, limit);
}
