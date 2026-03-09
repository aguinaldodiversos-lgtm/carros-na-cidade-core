// frontend/app/sitemaps/regiao/[state].xml/route.ts
import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(
  _req: Request,
  ctx: { params?: { state?: string } }
) {
  try {
    const raw = ctx?.params?.state ?? "";
    const normalizedState = String(raw).trim().toUpperCase();

    if (!normalizedState) {
      const xml = buildSitemapXml([]);
      return new NextResponse(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      });
    }

    const entries = await fetchPublicSitemapByRegion(normalizedState, 50000);
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
