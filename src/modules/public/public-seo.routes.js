import express from "express";
import * as controller from "./public-seo.controller.js";

const router = express.Router();

router.get("/sitemap", controller.getPublicSitemap);
router.get("/sitemap/type/:type", controller.getPublicSitemapByType);
router.get("/sitemap/region/:state", controller.getPublicSitemapByRegion);
router.get("/internal-links", controller.getInternalLinks);

export default router;
