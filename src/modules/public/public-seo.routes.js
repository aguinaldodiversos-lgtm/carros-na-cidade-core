import express from "express";
import {
  getInternalLinks,
  getPublicSitemapByRegion,
  getPublicSitemapByType,
  getPublicSitemapJson,
<<<<<<< HEAD
  sendCanonicalSitemapXml,
=======
>>>>>>> 9c3a7a1 (refatora fluxo de criacao de anuncio)
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
<<<<<<< HEAD
=======
async function sendCanonicalSitemapXml(req, res) {
  try {
    const limit = Number(req.query.limit || 50000);
    const entries = await listPublicSitemapEntries({ limit });
    const urls = entries.map((entry) =>
      buildUrlEntry(toAbsoluteUrl(entry.loc), {
        lastmod: entry.lastmod,
        changefreq: entry.changefreq,
        priority: entry.priority,
      })
    );

    if (urls.length === 0) {
      const ts = nowIso();
      urls.push(
        buildUrlEntry(`${getSiteUrl()}/`, { lastmod: ts, changefreq: "daily", priority: 1.0 }),
        buildUrlEntry(`${getSiteUrl()}/anuncios`, {
          lastmod: ts,
          changefreq: "daily",
          priority: 0.9,
        })
      );
    }

    const xml = buildSitemapXml(urls);

    res
      .status(200)
      .set("content-type", "application/xml; charset=utf-8")
      .set("cache-control", "public, max-age=300") // 5 min
      .send(xml);
  } catch (error) {
    logger.error({ error }, "[public-seo] falha ao gerar sitemap");

    const xml = buildSitemapXml([
      buildUrlEntry(`${getSiteUrl()}/`, { lastmod: nowIso(), changefreq: "daily", priority: 1.0 }),
      buildUrlEntry(`${getSiteUrl()}/anuncios`, {
        lastmod: nowIso(),
        changefreq: "daily",
        priority: 0.9,
      }),
    ]);

    res
      .status(200)
      .set("content-type", "application/xml; charset=utf-8")
      .set("cache-control", "no-store")
      .send(xml);
  }
}

router.get("/sitemap.json", getPublicSitemapJson);
>>>>>>> 9c3a7a1 (refatora fluxo de criacao de anuncio)
router.get("/sitemap/type/:type", getPublicSitemapByType);
router.get("/sitemap/region/:state", getPublicSitemapByRegion);
router.get("/internal-links", getInternalLinks);

<<<<<<< HEAD
=======
router.get("/sitemap", sendCanonicalSitemapXml);
router.get("/sitemap.xml", sendCanonicalSitemapXml);

>>>>>>> 9c3a7a1 (refatora fluxo de criacao de anuncio)
export default router;
