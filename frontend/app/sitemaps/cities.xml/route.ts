// frontend/app/sitemaps/cities.xml/route.ts
import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import {
  fetchPublicSitemapByTypes,
  type PublicSitemapEntry,
} from "../../../lib/seo/sitemap-client";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Política de canonical de transição para sitemap de cidades:
 *
 * O backend (`seo_cluster_plans.path` para cluster_type='city_home') ainda
 * grava paths no formato /cidade/[slug]. A página /cidade/[slug] foi
 * deduplicada para canonicalizar em /comprar/cidade/[slug] (canônica
 * intermediária do catálogo). Sitemap deve refletir a canônica — caso
 * contrário Googlebot indexa a URL antiga e gasta crawl budget.
 *
 * Esta função reescreve apenas paths que casam exatamente com /cidade/[slug]
 * (sem subrotas como /marca/, /modelo/, /oportunidades/, /abaixo-da-fipe/).
 * Subrotas têm sua própria política e ficam intactas.
 */
export function rewriteCityHomeEntries(entries: PublicSitemapEntry[]): PublicSitemapEntry[] {
  return entries.map((entry) => {
    if (!entry.loc) return entry;

    let path = entry.loc.trim();
    let prefix = "";

    if (path.includes("://")) {
      try {
        const url = new URL(path);
        prefix = `${url.protocol}//${url.host}`;
        path = url.pathname;
      } catch {
        return entry;
      }
    }

    const match = /^\/cidade\/([^/]+)\/?$/.exec(path);
    if (!match) return entry;

    const rewrittenPath = `/comprar/cidade/${match[1]}`;
    return { ...entry, loc: `${prefix}${rewrittenPath}` };
  });
}

export async function GET() {
  try {
    const entries = await fetchPublicSitemapByTypes(["city_home"], 50000);
    const rewritten = rewriteCityHomeEntries(entries);
    const xml = buildSitemapXml(rewritten);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    const xml = buildSitemapXml([]);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  }
}
