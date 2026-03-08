// frontend/app/sitemaps/core.xml/route.ts

import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import { getStaticSitemapEntries } from "../../../lib/seo/sitemap-static";

export const revalidate = 3600;

export async function GET() {
  const xml = buildSitemapXml(getStaticSitemapEntries());

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
