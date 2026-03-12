import express from "express";
import { logger } from "../../shared/logger.js";
import {
  getInternalLinks,
  getPublicSitemap,
  getPublicSitemapByRegion,
  getPublicSitemapByType,
} from "./public-seo.controller.js";
import {
  listPublicSitemapEntries,
} from "./public-seo.service.js";

const router = express.Router();

function getSiteUrl() {
  const raw =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_SITE_URL ||
    "https://carrosnacidade.com";

  return String(raw).trim().replace(/\/+$/, "");
}

function xmlEscape(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function nowIso() {
  return new Date().toISOString();
}

function toAbsoluteUrl(path) {
  const value = String(path ?? "").trim();
  if (!value) return getSiteUrl();
  if (/^https?:\/\//i.test(value)) return value;
  return `${getSiteUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function buildUrlEntry(loc, { lastmod, changefreq, priority } = {}) {
  const parts = [];
  parts.push("<url>");
  parts.push(`  <loc>${xmlEscape(loc)}</loc>`);
  if (lastmod) parts.push(`  <lastmod>${xmlEscape(lastmod)}</lastmod>`);
  if (changefreq) parts.push(`  <changefreq>${xmlEscape(changefreq)}</changefreq>`);
  if (priority !== undefined) parts.push(`  <priority>${String(priority)}</priority>`);
  parts.push("</url>");
  return parts.join("\n");
}

function buildSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls.join("\n")}\n` +
    `</urlset>\n`;
}

router.get("/sitemap", getPublicSitemap);
router.get("/sitemap/type/:type", getPublicSitemapByType);
router.get("/sitemap/region/:state", getPublicSitemapByRegion);
router.get("/internal-links", getInternalLinks);

router.get("/sitemap.xml", async (req, res) => {
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
        buildUrlEntry(`${getSiteUrl()}/anuncios`, { lastmod: ts, changefreq: "daily", priority: 0.9 })
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
      buildUrlEntry(`${getSiteUrl()}/anuncios`, { lastmod: nowIso(), changefreq: "daily", priority: 0.9 }),
    ]);

    res
      .status(200)
      .set("content-type", "application/xml; charset=utf-8")
      .set("cache-control", "no-store")
      .send(xml);
  }
});

export default router;
