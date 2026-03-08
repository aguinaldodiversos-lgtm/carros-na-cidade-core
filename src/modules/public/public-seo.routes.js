// src/modules/public/public-seo.routes.js
import express from "express";
import { logger } from "../../shared/logger.js";

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

// GET /api/public/seo/sitemap  e  /api/public/seo/sitemap.xml
router.get(["/sitemap", "/sitemap.xml"], async (_req, res) => {
  try {
    const siteUrl = getSiteUrl();
    const ts = nowIso();

    // Sitemap mínimo (não quebra)
    const urls = [
      buildUrlEntry(`${siteUrl}/`, { lastmod: ts, changefreq: "hourly", priority: 1.0 }),
      buildUrlEntry(`${siteUrl}/anuncios`, { lastmod: ts, changefreq: "hourly", priority: 0.9 }),
      // páginas territoriais podem ser adicionadas aqui depois:
      // buildUrlEntry(`${siteUrl}/cidade/atibaia-sp`, { lastmod: ts, changefreq: "daily", priority: 0.8 }),
    ];

    const xml = buildSitemapXml(urls);

    res
      .status(200)
      .set("content-type", "application/xml; charset=utf-8")
      .set("cache-control", "public, max-age=300") // 5 min
      .send(xml);
  } catch (error) {
    logger.error({ error }, "[public-seo] falha ao gerar sitemap");

    // Fallback extremo: nunca retornar 500 sem corpo útil
    const siteUrl = getSiteUrl();
    const xml = buildSitemapXml([
      buildUrlEntry(`${siteUrl}/`, { lastmod: nowIso(), changefreq: "daily", priority: 1.0 }),
    ]);

    res
      .status(200)
      .set("content-type", "application/xml; charset=utf-8")
      .set("cache-control", "no-store")
      .send(xml);
  }
});

export default router;
