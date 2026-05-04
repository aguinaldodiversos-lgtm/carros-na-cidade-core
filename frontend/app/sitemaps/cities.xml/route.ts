// frontend/app/sitemaps/cities.xml/route.ts
import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";
import { rewriteCityHomeEntries } from "../_lib/transition-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

// `rewriteCityHomeEntries` foi movido para `../_lib/transition-helpers.ts`
// porque Next 14 App Router só aceita exports válidos de Route em route.ts
// (handlers HTTP + dynamic/revalidate/runtime/etc). Manter o helper aqui
// quebrava o build com "is not a valid Route export field".

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
