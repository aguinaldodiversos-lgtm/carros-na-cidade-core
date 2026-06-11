// frontend/lib/seo/blog-sitemap.ts
//
// Fase 4.3 (§10) — entradas de sitemap para os posts do Blog do CMS.
//
// Lacuna corrigida: até a 4.3 nenhum sitemap listava os posts publicados do
// CMS (/blog/<slug>). Esta função PURA converte os posts em entradas de
// sitemap, respeitando as regras: só `published` E `is_indexable` (post
// publicado mas noindex NÃO entra), lastmod = updated_at (cai para
// published_at), URL canônica global /blog/<slug>.
import type { PublicSitemapEntry } from "./sitemap-client";
import type { CmsBlogPost } from "@/lib/blog/blog-cms";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildBlogSitemapEntries(posts: CmsBlogPost[]): PublicSitemapEntry[] {
  if (!Array.isArray(posts)) return [];
  return (
    posts
      .filter((p) => p && p.slug && SLUG_RE.test(p.slug))
      // Post publicado mas marcado como não-indexável fica FORA do sitemap.
      .filter((p) => p.is_indexable !== false)
      .map((p) => ({
        loc: `/blog/${p.slug}`,
        lastmod: p.updated_at || p.published_at || undefined,
        changefreq: "weekly",
        priority: 0.6,
      }))
  );
}
