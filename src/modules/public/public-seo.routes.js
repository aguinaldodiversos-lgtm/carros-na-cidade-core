import express from "express";
import {
  listPublicSitemapEntries,
  listPublicSitemapEntriesByRegion,
  listPublicSitemapEntriesByType,
} from "./public-seo.service.js";

const router = express.Router();

function getLimit(req) {
  const value = Number(req.query.limit || 10000);
  if (!Number.isFinite(value)) return 10000;
  return Math.max(1, Math.min(50000, Math.floor(value)));
}

router.get("/sitemap", async (req, res, next) => {
  try {
    const data = await listPublicSitemapEntries({
      limit: getLimit(req),
    });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sitemap/type/:type", async (req, res, next) => {
  try {
    const data = await listPublicSitemapEntriesByType(req.params.type, {
      limit: getLimit(req),
    });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/sitemap/region/:state", async (req, res, next) => {
  try {
    const data = await listPublicSitemapEntriesByRegion(req.params.state, {
      limit: getLimit(req),
    });

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
