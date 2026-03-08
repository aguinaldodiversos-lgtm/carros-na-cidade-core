// frontend/app/sitemaps/below-fipe.xml/route.ts

import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";

export const revalidate = 3600;

export async function GET() {
  const entries = await fetchPublicSitemapByTypes(["city_below_fipe"], 50000);
  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
