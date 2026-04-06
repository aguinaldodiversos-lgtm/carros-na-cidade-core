import express from "express";
import {
  getInternalLinks,
  getPublicSitemapByRegion,
  getPublicSitemapByType,
  getPublicSitemapJson,
  sendCanonicalSitemapXml,
} from "./public-seo.controller.js";

const router = express.Router();
import { logger } from "../../shared/logger.js";
import { listPublicSitemapEntries } from "./public-seo.service.js";

/**
 * IMPORTANTE:
 * Mantenha neste arquivo as implementações já existentes de:
 * - getInternalLinks
 * - getPublicSitemapByRegion
 * - getPublicSitemapByType
 *
 * E adicione/substitua as funções abaixo.
 */

function getSiteUrl() {
  const raw =
    process.env.SITE_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_SITE_URL ||
    "https://carrosnacidade.com";

  return String(raw).trim().replace(/\/+$/, "");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nowIso() {
  return new Date().toISOString();
}

function toSafeLimit(value, fallback = 50000) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50000);
}

function toAbsoluteUrl(path) {
  const value = String(path ?? "").trim();
  if (!value) return `${getSiteUrl()}/`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${getSiteUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function normalizeLastmod(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function sanitizePriority(value) {
  if (value == null || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  const clamped = Math.max(0, Math.min(1, numeric));
  return clamped.toFixed(1);
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry) => entry && typeof entry === "object" && String(entry.loc || "").trim())
    .map((entry) => ({
      loc: toAbsoluteUrl(entry.loc),
      lastmod: normalizeLastmod(entry.lastmod),
      changefreq: entry.changefreq ? String(entry.changefreq).trim() : null,
      priority: sanitizePriority(entry.priority),
    }));
}

function buildUrlEntry(loc, { lastmod, changefreq, priority } = {}) {
  const parts = [];

  parts.push("<url>");
  parts.push(`  <loc>${xmlEscape(loc)}</loc>`);
  if (lastmod) parts.push(`  <lastmod>${xmlEscape(lastmod)}</lastmod>`);
  if (changefreq) parts.push(`  <changefreq>${xmlEscape(changefreq)}</changefreq>`);
  if (priority != null) parts.push(`  <priority>${priority}</priority>`);
  parts.push("</url>");

  return parts.join("\n");
}

function buildSitemapXml(urls) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

function buildFallbackEntries() {
  const ts = nowIso();
  return [
    {
      loc: `${getSiteUrl()}/`,
      lastmod: ts,
      changefreq: "daily",
      priority: "1.0",
    },
    {
      loc: `${getSiteUrl()}/anuncios`,
      lastmod: ts,
      changefreq: "daily",
      priority: "0.9",
    },
  ];
}

function toJsonPayload(entries) {
  return {
    success: true,
    data: entries.map((entry) => ({
      loc: entry.loc,
      lastmod: entry.lastmod,
      changefreq: entry.changefreq,
      priority: entry.priority,
    })),
  };
}

async function loadCanonicalEntries(req) {
  const limit = toSafeLimit(req.query.limit, 50000);
  const entries = await listPublicSitemapEntries({ limit });
  const sanitized = sanitizeEntries(entries);

  return sanitized.length > 0 ? sanitized : buildFallbackEntries();
}

/**
 * Sitemap canônico em XML
 * Usado por:
 * - GET /api/public/seo/sitemap
 * - GET /api/public/seo/sitemap.xml
 */
export async function sendCanonicalSitemapXml(req, res) {
  try {
    const entries = await loadCanonicalEntries(req);
    const urls = entries.map((entry) =>
      buildUrlEntry(entry.loc, {
        lastmod: entry.lastmod,
        changefreq: entry.changefreq,
        priority: entry.priority,
      })
    );

    const xml = buildSitemapXml(urls);

    return res
      .status(200)
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", "public, max-age=300")
      .send(xml);
  } catch (error) {
    logger.error({ error }, "[public-seo] falha ao gerar sitemap XML");

    const fallbackEntries = buildFallbackEntries();
    const xml = buildSitemapXml(
      fallbackEntries.map((entry) =>
        buildUrlEntry(entry.loc, {
          lastmod: entry.lastmod,
          changefreq: entry.changefreq,
          priority: entry.priority,
        })
      )
    );

    return res
      .status(200)
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(xml);
  }
}

/**
 * Inventário do sitemap em JSON
 * Usado internamente pelo frontend/SSR
 */
export async function getPublicSitemapJson(req, res) {
  try {
    const entries = await loadCanonicalEntries(req);

    return res
      .status(200)
      .set("Content-Type", "application/json; charset=utf-8")
      .set("Cache-Control", "public, max-age=60")
      .json(toJsonPayload(entries));
  } catch (error) {
    logger.error({ error }, "[public-seo] falha ao gerar sitemap JSON");

    return res.status(500).json({
      success: false,
      error: "Falha ao gerar sitemap JSON.",
      data: [],
    });
  }
}
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
