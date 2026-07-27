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
  const allowed = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);

  return allowed.has(normalized) ? normalized : undefined;
}

const IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";

/**
 * `<image:image>` aninhado no `<url>` da página que exibe a imagem.
 *
 * O Google descontinuou o sitemap de imagens dedicado; a prática atual é
 * aninhar no sitemap de páginas. Emitimos SÓ `<image:loc>`: `<image:caption>`,
 * `<image:title>`, `<image:license>` e `<image:geo_location>` foram
 * descontinuadas e são ignoradas — incluí-las só engorda o XML.
 *
 * Ordem preservada do array: a primeira é a capa do anúncio, que o Google
 * trata como a mais representativa da página.
 */
function buildImageNodes(images?: string[]): string {
  if (!Array.isArray(images) || images.length === 0) return "";

  return images
    .filter((src) => typeof src === "string" && src.trim())
    .map((src) => `<image:image><image:loc>${escapeXml(src.trim())}</image:loc></image:image>`)
    .join("");
}

export function buildSitemapXml(entries: PublicSitemapEntry[]): string {
  // Namespace de imagem só entra quando ALGUMA entrada tem imagem. Este
  // gerador é compartilhado pelos 10 sitemaps (cities, models, brands, blog…);
  // declarar `xmlns:image` incondicionalmente mudaria o XML de todos eles sem
  // nenhum ganho.
  const temImagem = entries.some((entry) => entry.loc && (entry.images?.length ?? 0) > 0);

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
        // Anúncio sem imagem elegível simplesmente não emite as tags — o
        // `<url>` continua válido sozinho.
        buildImageNodes(entry.images),
        "</url>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"` +
    (temImagem ? ` xmlns:image="${IMAGE_NS}"` : "") +
    `>` +
    body +
    `</urlset>`
  );
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

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    body +
    `</sitemapindex>`
  );
}
