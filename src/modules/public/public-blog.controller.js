import { AppError } from "../../shared/middlewares/error.middleware.js";
import { listPublicPosts, getPublicPostBySlug } from "../admin/blog/admin-blog.service.js";

/**
 * Rotas públicas do Blog (Fase 4.2).
 *
 * Contrato espelha as demais rotas públicas:
 *   { success: true, data: ..., total?, limit?, offset? }
 *
 * Visibilidade: APENAS status='published'. Draft/unpublished/archived
 * retornam 404 no detalhe e nunca aparecem na lista — o filtro é feito no
 * SQL (repository.listPublishedPosts / findPublishedBySlug), não aqui.
 */

function parseIntQuery(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * GET /api/public/blog/posts?category=&limit=&offset=
 * Lista paginada de posts publicados, mais recentes primeiro.
 */
export async function listPublicBlogPosts(req, res, next) {
  try {
    const result = await listPublicPosts({
      category: req.query.category || undefined,
      limit: parseIntQuery(req.query.limit, 12),
      offset: parseIntQuery(req.query.offset, 0),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/public/blog/posts/:slug
 * Detalhe de post publicado. 404 para qualquer outro status — visitante
 * não distingue "não existe" de "existe mas não está no ar".
 */
export async function getPublicBlogPostBySlug(req, res, next) {
  try {
    const post = await getPublicPostBySlug(req.params.slug);
    if (!post) {
      throw new AppError("Post não encontrado.", 404);
    }
    res.json({ success: true, data: post });
  } catch (err) {
    next(err);
  }
}
