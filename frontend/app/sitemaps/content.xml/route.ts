import { NextResponse } from "next/server";
import { getStaticCitySlugs } from "../../../lib/market/market-data";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const lastmod = new Date().toISOString();
  const citySlugs = getStaticCitySlugs(5000);
  const entries = citySlugs.flatMap((cidade) => [
    {
      loc: `/blog/${cidade}`,
      lastmod,
      changefreq: "weekly",
      priority: 0.6,
    },
    {
      loc: `/tabela-fipe/${cidade}`,
      lastmod,
      changefreq: "weekly",
      priority: 0.7,
    },
    {
      loc: `/simulador-financiamento/${cidade}`,
      lastmod,
      changefreq: "weekly",
      priority: 0.7,
    },
  ]);

  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
