// frontend/app/sitemaps/models.xml/route.ts
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";
import { sitemapResponse } from "../_lib/sitemap-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return sitemapResponse(await fetchPublicSitemapByTypes(["city_brand_model"], 50000));
}
