// frontend/app/sitemaps/cities.xml/route.ts
import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

// SEO 2026-07-04: o backend agora emite o `city_home` já como a URL CANÔNICA
// `/carros-em/[slug]` (fonte = estoque ativo, >= SITEMAP_MIN_ADS). Não há mais
// rewrite `/cidade` → `/comprar/cidade`: o sitemap contém APENAS a canônica de
// cada cidade (nunca `/cidade` nem `/comprar/cidade`).

export async function GET() {
  try {
    const entries = await fetchPublicSitemapByTypes(["city_home"], 50000);
    const xml = buildSitemapXml(entries);

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
