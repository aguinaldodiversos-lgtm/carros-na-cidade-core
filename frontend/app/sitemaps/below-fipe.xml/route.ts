// frontend/app/sitemaps/below-fipe.xml/route.ts
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";
import { sitemapResponse } from "../_lib/sitemap-response";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  return sitemapResponse(await fetchPublicSitemapByTypes(["city_below_fipe"], 50000));
}
