import { query } from "../../../infrastructure/database/db.js";
import { logger } from "../../../shared/logger.js";
import { analyzeAds, analyzeBlogPosts, buildAiHealthSummary } from "./seo-ai-audit.js";

/**
 * Saúde SEO/IA do portal (Fase 4.3, §15) — alimenta GET /api/admin/seo/ai-health.
 *
 * Agrega, em uma só resposta: qualidade dos anúncios ativos (score, sem
 * preço/cidade/imagem/descrição), saúde dos posts do CMS (publicados sem meta
 * description, conteúdo curto, slug duplicado) e a contagem de páginas
 * territoriais indexáveis/noindex por tipo (seo_publications.cluster_type).
 *
 * Defensivo: cada bloco roda em try/catch — uma tabela ausente/legada (ex.:
 * seo_publications criada out-of-band) não derruba o endpoint.
 */

async function loadActiveAds(limit) {
  try {
    const { rows } = await query(
      `SELECT a.*, c.name AS city_name
         FROM ads a
         LEFT JOIN cities c ON c.id = a.city_id
        WHERE a.status = 'active'
        ORDER BY a.updated_at DESC NULLS LAST
        LIMIT $1`,
      [limit]
    );
    return rows;
  } catch (err) {
    logger.warn({ err: err?.message }, "[admin-seo-ai] falha ao carregar anúncios");
    return [];
  }
}

async function loadCmsPosts(limit) {
  try {
    const { rows } = await query(
      `SELECT id, slug, status, content, excerpt, meta_description, cover_image_url
         FROM blog_posts
        WHERE source = 'cms'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $1`,
      [limit]
    );
    return rows;
  } catch (err) {
    logger.warn({ err: err?.message }, "[admin-seo-ai] falha ao carregar posts");
    return [];
  }
}

async function loadPublicationRows() {
  try {
    const { rows } = await query(`SELECT cluster_type, is_indexable FROM seo_publications`);
    return rows;
  } catch {
    // Tabela pode não existir em dev/test — território fica vazio.
    return [];
  }
}

/**
 * @param {{ limit?: number }} opts
 * @returns relatório §15 (ads / blog / territorial) + timestamp.
 */
export async function getAiHealth({ limit = 1000 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1000, 1), 5000);

  const [ads, posts, publicationRows] = await Promise.all([
    loadActiveAds(safeLimit),
    loadCmsPosts(safeLimit),
    loadPublicationRows(),
  ]);

  const adsAnalysis = analyzeAds(ads);
  const blogAnalysis = analyzeBlogPosts(posts);
  const summary = buildAiHealthSummary({ adsAnalysis, blogAnalysis, publicationRows });

  return {
    ...summary,
    generated_at: new Date().toISOString(),
    sampled: { ads: ads.length, posts: posts.length, publications: publicationRows.length },
  };
}
