import { logger } from "../../shared/logger.js";
import * as sitemapPublicService from "../../read-models/seo/sitemap-public.service.js";
import * as internalLinksPublicService from "../../read-models/seo/internal-links-public.service.js";

import { listPublicSitemapEntries } from "./public-seo.service.js";

const DEFAULT_SITEMAP_LIMIT = 50000;
const DEFAULT_INTERNAL_LINKS_LIMIT = 200;
const MAX_SITEMAP_LIMIT = 50000;
const MAX_INTERNAL_LINKS_LIMIT = 1000;

const ALLOWED_CHANGEFREQ = new Set([
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
]);

function toSafePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

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

function toAbsoluteUrl(path) {
  const value = String(path ?? "").trim();

  if (!value) {
    return `${getSiteUrl()}/`;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${getSiteUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function normalizeLastmod(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function normalizeChangefreq(value) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) return null;
  if (!ALLOWED_CHANGEFREQ.has(normalized)) return null;

  return normalized;
}

function normalizePriority(value) {
  if (value == null || value === "") return null;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  const clamped = Math.max(0, Math.min(1, numeric));
  return clamped.toFixed(1);
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      loc: toAbsoluteUrl(entry.loc || entry.url || entry.path || "/"),
      lastmod: normalizeLastmod(entry.lastmod || entry.updated_at || entry.updatedAt),
      changefreq: normalizeChangefreq(entry.changefreq),
      priority: normalizePriority(entry.priority),
    }))
    .filter((entry) => entry.loc);
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

async function loadCanonicalEntries(limit) {
  const rawEntries = await listPublicSitemapEntries({ limit });
  const sanitized = sanitizeEntries(rawEntries);

  return sanitized.length > 0 ? sanitized : buildFallbackEntries();
}

export async function sendCanonicalSitemapXml(req, res) {
  const limit = toSafePositiveInt(req.query.limit, DEFAULT_SITEMAP_LIMIT, MAX_SITEMAP_LIMIT);

  try {
    const entries = await loadCanonicalEntries(limit);
    const xml = buildSitemapXml(
      entries.map((entry) =>
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

export async function getPublicSitemapJson(req, res, next) {
  const limit = toSafePositiveInt(req.query.limit, DEFAULT_SITEMAP_LIMIT, MAX_SITEMAP_LIMIT);

  try {
    const entries = await loadCanonicalEntries(limit);

    return res
      .status(200)
      .set("Content-Type", "application/json; charset=utf-8")
      .set("Cache-Control", "public, max-age=60")
      .json(toJsonPayload(entries));
  } catch (err) {
    logger.error({ error: err }, "[public-seo] falha ao gerar sitemap JSON");
    return next(err);
  }
}

export async function getPublicSitemapByType(req, res, next) {
  try {
    const limit = toSafePositiveInt(req.query.limit, DEFAULT_SITEMAP_LIMIT, MAX_SITEMAP_LIMIT);
    const data = await sitemapPublicService.getPublicSitemapByType(req.params.type, limit);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error(
      { error: err, type: req.params.type },
      "[public-seo] falha ao gerar sitemap por tipo"
    );
    return next(err);
  }
}

export async function getPublicSitemapByRegion(req, res, next) {
  try {
    const limit = toSafePositiveInt(req.query.limit, DEFAULT_SITEMAP_LIMIT, MAX_SITEMAP_LIMIT);
    const data = await sitemapPublicService.getPublicSitemapByRegion(req.params.state, limit);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error(
      { error: err, state: req.params.state },
      "[public-seo] falha ao gerar sitemap por região"
    );
    return next(err);
  }
}

export async function getInternalLinks(req, res, next) {
  try {
    const limit = toSafePositiveInt(
      req.query.limit,
      DEFAULT_INTERNAL_LINKS_LIMIT,
      MAX_INTERNAL_LINKS_LIMIT
    );
    const path = String(req.query.path ?? "").trim();

    const data = await internalLinksPublicService.getInternalLinksByPath(path, limit);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    logger.error(
      { error: err, path: req.query.path },
      "[public-seo] falha ao gerar links internos públicos"
    );
    return next(err);
  }
}
