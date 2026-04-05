import * as sitemapPublicService from "../../read-models/seo/sitemap-public.service.js";
import * as internalLinksPublicService from "../../read-models/seo/internal-links-public.service.js";

export async function getPublicSitemapByType(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50000);
    const data = await sitemapPublicService.getPublicSitemapByType(req.params.type, limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPublicSitemapByRegion(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50000);
    const data = await sitemapPublicService.getPublicSitemapByRegion(req.params.state, limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function getInternalLinks(req, res, next) {
  try {
    const limit = Number(req.query.limit || 200);
    const data = await internalLinksPublicService.getInternalLinksByPath(req.query.path, limit);

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
