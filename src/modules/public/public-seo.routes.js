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
 * Rotas canônicas de sitemap
 * - /sitemap e /sitemap.xml => XML para crawlers / smoke
 * - /sitemap.json => JSON para consumo interno do frontend/SSR
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
