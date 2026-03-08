// frontend/lib/seo/sitemap-xml.ts

import { toAbsoluteUrl } from "./site";
import type { PublicSitemapEntry } from "./sitemap-client";

export interface SitemapIndexItem {
  loc: string;
  lastmod?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.toISOString();
}

function normalizePriority(value?: string | number): string | undefined {
  if (value === undefined || value === null) return undefined;

  const priority = Number(value);
  if (!Number.isFinite(priority)) return undefined;

  return Math.max(0, Math.min(1, priority)).toFixed(1);
}

function normalizeChangefreq(value?: string): string | undefined {
  if (!value) return undefined;

  const normalized = String(value).trim().toLowerCase();
  const allowed = new Set([
    "always",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "never",
  ]);

  return allowed.has(normalized) ? normalized : undefined;
}

export function buildSitemapXml(entries: PublicSitemapEntry[]): string {
  const body = entries
    .filter((entry) => entry.loc)
    .map((entry) => {
      const loc = escapeXml(toAbsoluteUrl(entry.loc));
      const lastmod = normalizeDate(entry.lastmod);
      const changefreq = normalizeChangefreq(entry.changefreq);
      const priority = normalizePriority(entry.priority);

      return [
        "<url>",
        `<loc>${loc}</loc>`,
        lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : "",
        changefreq ? `<changefreq>${escapeXml(changefreq)}</changefreq>` : "",
        priority ? `<priority>${escapeXml(priority)}</priority>` : "",
        "</url>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    body +
    `</urlset>`;
}

export function buildSitemapIndexXml(items: SitemapIndexItem[]): string {
  const body = items
    .filter((item) => item.loc)
    .map((item) => {
      const loc = escapeXml(toAbsoluteUrl(item.loc));
      const lastmod = normalizeDate(item.lastmod);

      return [
        "<sitemap>",
        `<loc>${loc}</loc>`,
        lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : "",
        "</sitemap>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    body +
    `</sitemapindex>`;
}
