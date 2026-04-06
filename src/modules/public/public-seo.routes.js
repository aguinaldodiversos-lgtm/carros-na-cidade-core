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
 * Sitemap canônico
 * - /sitemap e /sitemap.xml => XML para crawlers e smoke tests
 * - /sitemap.json => JSON para consumo interno do frontend/SSR
 *
 * IMPORTANTE:
 * manter as rotas canônicas antes das rotas segmentadas
 * para deixar a intenção clara e evitar regressões futuras.
 */
router.get("/sitemap", sendCanonicalSitemapXml);
router.get("/sitemap.xml", sendCanonicalSitemapXml);
router.get("/sitemap.json", getPublicSitemapJson);

/**
 * Rotas auxiliares/segmentadas
 */
router.get("/sitemap/type/:type", getPublicSitemapByType);
router.get("/sitemap/region/:state", getPublicSitemapByRegion);
router.get("/internal-links", getInternalLinks);

export default router;
