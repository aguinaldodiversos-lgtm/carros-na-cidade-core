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
 * Sitemap canônico: /sitemap e /sitemap.xml → XML; /sitemap.json → JSON.
 * Rotas canônicas antes das segmentadas.
 */

router.get("/sitemap", sendCanonicalSitemapXml);
router.get("/sitemap.xml", sendCanonicalSitemapXml);
router.get("/sitemap.json", getPublicSitemapJson);

router.get("/sitemap/type/:type([a-zA-Z0-9_-]+)", getPublicSitemapByType);
router.get("/sitemap/region/:state([a-zA-Z0-9-]+)", getPublicSitemapByRegion);

router.get("/sitemap/type/:type", getPublicSitemapByType);
router.get("/sitemap/region/:state", getPublicSitemapByRegion);

router.get("/internal-links", getInternalLinks);

export default router;
