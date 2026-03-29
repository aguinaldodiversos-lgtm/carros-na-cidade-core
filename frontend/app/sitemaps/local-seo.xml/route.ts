import { NextResponse } from "next/server";
import type { PublicSitemapEntry } from "@/lib/seo/sitemap-client";
import { fetchPublicSitemapByTypes } from "@/lib/seo/sitemap-client";
import { buildSitemapXml } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

function slugFromCityHomeLoc(loc: string): string | null {
  let path = loc.trim();
  try {
    if (path.includes("://")) {
      path = new URL(path).pathname;
    }
  } catch {
    return null;
  }
  const m = /^\/cidade\/([^/]+)\/?$/.exec(path);
  return m?.[1] ?? null;
}

function expandLocalSeoEntries(cityHomes: PublicSitemapEntry[]): PublicSitemapEntry[] {
  const out: PublicSitemapEntry[] = [];
  const lastmod = new Date().toISOString();

  for (const entry of cityHomes) {
    const slug = slugFromCityHomeLoc(entry.loc);
    if (!slug) continue;

    const base = {
      lastmod: entry.lastmod || lastmod,
      changefreq: "daily" as const,
      priority: 0.75,
    };

    out.push(
      { loc: `/carros-em/${slug}`, ...base },
      { loc: `/carros-baratos-em/${slug}`, ...base },
      { loc: `/carros-automaticos-em/${slug}`, ...base }
    );
  }

  return out;
}

export async function GET() {
  try {
    const cityHomes = await fetchPublicSitemapByTypes(["city_home"], 50000);
    const entries = expandLocalSeoEntries(cityHomes);
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
