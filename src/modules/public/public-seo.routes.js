import express from "express";
import {
  getInternalLinks,
  getPublicSitemapByRegion,
  getPublicSitemapByType,
  getPublicSitemapJson,
  sendCanonicalSitemapXml,
} from "./public-seo.controller.js";

const router = express.Router();

/**
 * Rotas canônicas do sitemap
 * - /sitemap e /sitemap.xml => XML para crawlers, smoke tests e SEO
 * - /sitemap.json => JSON para consumo interno do frontend/SSR
 *
 * Mantemos essas rotas explícitas e no topo para deixar a intenção clara.
 */
const canonicalSitemapRoutes = [
  ["/sitemap", sendCanonicalSitemapXml],
  ["/sitemap.xml", sendCanonicalSitemapXml],
  ["/sitemap.json", getPublicSitemapJson],
];

for (const [path, handler] of canonicalSitemapRoutes) {
  router.get(path, handler);
}

/**
 * Rotas auxiliares/segmentadas
 *
 * Restrições leves:
 * - :state aceita letras, números e hífen
 * - :type aceita letras, números, underscore e hífen
 *
 * Isso ajuda a evitar entradas claramente inválidas sem acoplar
 * demais a rota a regras de domínio que podem mudar.
 */
router.get("/sitemap/type/:type([a-zA-Z0-9_-]+)", getPublicSitemapByType);
router.get("/sitemap/region/:state([a-zA-Z0-9-]+)", getPublicSitemapByRegion);
router.get("/internal-links", getInternalLinks);

export default router;
