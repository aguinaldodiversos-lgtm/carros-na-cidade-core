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

/**
 * @deprecated NÃO USAR EM SITEMAP PÚBLICO — não valida estoque.
 *
 * Lê `seo_cluster_plans`, uma tabela de PLANEJAMENTO: ela sabe quais landings
 * foram planejadas, não quais têm anúncio ativo. Foi por isto que
 * `/sitemaps/regiao/sp.xml` publicava `/carros-em/braganca-paulista-sp` com
 * Bragança em zero anúncios — URL que o gate territorial responde 404
 * (auditoria 2026-08-07).
 *
 * `getPublicSitemapByRegion` passou a compor as entradas de estoque ativo
 * (`territorial-inventory-sitemap.service.js`) filtradas por UF. Esta função
 * ficou sem chamador e é mantida só para não quebrar consumidor externo
 * desconhecido. Se você está pensando em usá-la num sitemap, não use.
 */
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
