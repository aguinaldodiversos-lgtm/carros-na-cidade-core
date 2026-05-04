// frontend/app/sitemaps/opportunities.xml/route.ts
import { NextResponse } from "next/server";
import { buildSitemapXml } from "@/lib/seo/sitemap-xml";
import { buildOpportunitiesTransitionEntries } from "../_lib/transition-helpers";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

// `buildOpportunitiesTransitionEntries` foi movido para
// `../_lib/transition-helpers.ts`. Em Next 14 App Router, route.ts só
// aceita exports válidos de Route (handlers HTTP + config), e helpers
// nomeados quebram o build.

export async function GET() {
  const entries = buildOpportunitiesTransitionEntries();
  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
