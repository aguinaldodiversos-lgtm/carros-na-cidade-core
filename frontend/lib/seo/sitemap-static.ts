// frontend/lib/seo/sitemap-static.ts

import type { PublicSitemapEntry } from "./sitemap-client";

export function getStaticSitemapEntries(): PublicSitemapEntry[] {
  const now = new Date().toISOString();

  return [
    {
      loc: "/",
      lastmod: now,
      changefreq: "daily",
      priority: 1,
    },
    {
      loc: "/anuncios",
      lastmod: now,
      changefreq: "daily",
      priority: 0.9,
    },
    {
      loc: "/comprar",
      lastmod: now,
      changefreq: "daily",
      priority: 0.9,
    },
    {
      loc: "/blog",
      lastmod: now,
      changefreq: "weekly",
      priority: 0.7,
    },
    {
      loc: "/planos",
      lastmod: now,
      changefreq: "monthly",
      priority: 0.6,
    },
    // `/simulador-financiamento` removido do sitemap (SEO 2026-07-03): a rota
    // raiz só redireciona para `/simulador-financiamento/[cidade]`, que é
    // `noindex` (ferramenta interativa). URL noindex/redirect não pode constar
    // no sitemap.
    {
      loc: "/tabela-fipe",
      lastmod: now,
      changefreq: "weekly",
      priority: 0.6,
    },
  ];
}
