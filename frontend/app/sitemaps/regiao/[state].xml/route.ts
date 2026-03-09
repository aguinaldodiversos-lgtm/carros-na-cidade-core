// frontend/app/sitemaps/regiao/[state].xml/route.ts
import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

type RouteContext = {
  params: { state: string };
};

export async function GET(_req: Request, ctx: RouteContext) {
  const state = ctx?.params?.state;
  const normalizedState = String(state || "").trim().toUpperCase();

  // Se alguém chamar sem state (ou build/export tentar), devolve sitemap vazio (200) para não quebrar.
  if (!normalizedState) {
    const xml = buildSitemapXml([]);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  try {
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
    // fallback: sitemap vazio em caso de API offline
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
