// frontend/app/sitemaps/regiao/[state].xml/route.ts

import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";

export const revalidate = 3600;

interface RegionSitemapRouteProps {
  params: Promise<{ state: string }>;
}

export async function GET(_: Request, { params }: RegionSitemapRouteProps) {
  const { state } = await params;
  const normalizedState = String(state || "").trim().toUpperCase();

  const entries = await fetchPublicSitemapByRegion(normalizedState, 50000);
  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
