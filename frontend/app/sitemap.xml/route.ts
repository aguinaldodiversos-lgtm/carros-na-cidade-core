// frontend/app/sitemap.xml/route.ts

import { NextResponse } from "next/server";
import { buildSitemapIndexXml } from "../../lib/seo/sitemap-xml";
import { detectAvailableStates } from "../../lib/seo/sitemap-client";

export const revalidate = 3600;

export async function GET() {
  const now = new Date().toISOString();

  let states: string[] = [];
  try {
    states = await detectAvailableStates(100000);
  } catch {
    states = [];
  }

  const items = [
    { loc: "/sitemaps/core.xml", lastmod: now },
    { loc: "/sitemaps/cities.xml", lastmod: now },
    { loc: "/sitemaps/brands.xml", lastmod: now },
    { loc: "/sitemaps/models.xml", lastmod: now },
    { loc: "/sitemaps/opportunities.xml", lastmod: now },
    { loc: "/sitemaps/below-fipe.xml", lastmod: now },
    ...states.map((state) => ({
      loc: `/sitemaps/regiao/${state}.xml`,
      lastmod: now,
    })),
  ];

  const xml = buildSitemapIndexXml(items);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
