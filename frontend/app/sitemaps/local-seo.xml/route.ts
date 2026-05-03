// frontend/app/sitemaps/local-seo.xml/route.ts
import { NextResponse } from "next/server";
import type { PublicSitemapEntry } from "@/lib/seo/sitemap-client";
import { buildSitemapXml } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Política de canonical de transição para landings SEO local:
 *
 *   /carros-em/[slug]            → canonical /comprar/cidade/[slug]
 *   /carros-baratos-em/[slug]    → canonical /cidade/[slug]/abaixo-da-fipe
 *   /carros-automaticos-em/[slug]→ canonical /comprar/cidade/[slug] (+ noindex,follow)
 *
 * Como as 3 URLs canonicalizam para outra família, listá-las no sitemap
 * desperdiçaria crawl budget e poderia confundir Googlebot. Mantemos a
 * rota /sitemaps/local-seo.xml viva (referenciada no /sitemap.xml index)
 * mas o body fica como <urlset> vazio. Quando a fase de migração permitir
 * 301, esta rota pode ser removida do index e do disco.
 *
 * As páginas continuam acessíveis (sem 301) — só não estão no sitemap.
 */
export function buildLocalSeoTransitionEntries(): PublicSitemapEntry[] {
  return [];
}

export async function GET() {
  const entries = buildLocalSeoTransitionEntries();
  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
