export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { detectAvailableStates } from "../../lib/seo/sitemap-client";
import { buildSitemapIndexXml } from "../../lib/seo/sitemap-xml";

export async function GET() {
  const lastmod = new Date().toISOString();
  const fixedSitemaps = [
    "/sitemaps/core.xml",
    "/sitemaps/content.xml",
    "/sitemaps/cities.xml",
    "/sitemaps/local-seo.xml",
    "/sitemaps/brands.xml",
    "/sitemaps/models.xml",
    "/sitemaps/opportunities.xml",
    "/sitemaps/below-fipe.xml",
  ];

  let states: string[] = [];
  try {
    states = await detectAvailableStates();
  } catch {
    states = [];
  }

  const xml = buildSitemapIndexXml([
    ...fixedSitemaps.map((loc) => ({ loc, lastmod })),
    ...states.map((state) => ({ loc: `/sitemaps/regiao/${state}.xml`, lastmod })),
  ]);

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
