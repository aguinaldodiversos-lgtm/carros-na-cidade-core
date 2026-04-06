import express from "express";
import {
  getInternalLinks,
  getPublicSitemapByRegion,
  getPublicSitemapByType,
  getPublicSitemapJson,
  sendCanonicalSitemapXml,
} from "./public-seo.controller.js";

const router = express.Router();

<<<<<<< HEAD
=======
/**
 * Sitemap canônico: /sitemap e /sitemap.xml → XML; /sitemap.json → JSON.
 * Rotas canônicas antes das segmentadas.
 */
>>>>>>> eef8a4e (refatora fluxo de criacao de anuncio)
router.get("/sitemap", sendCanonicalSitemapXml);
router.get("/sitemap.xml", sendCanonicalSitemapXml);
router.get("/sitemap.json", getPublicSitemapJson);

<<<<<<< HEAD
router.get("/sitemap/type/:type([a-zA-Z0-9_-]+)", getPublicSitemapByType);
router.get("/sitemap/region/:state([a-zA-Z0-9-]+)", getPublicSitemapByRegion);
=======
router.get("/sitemap/type/:type", getPublicSitemapByType);
router.get("/sitemap/region/:state", getPublicSitemapByRegion);
>>>>>>> eef8a4e (refatora fluxo de criacao de anuncio)
router.get("/internal-links", getInternalLinks);

export default router;
