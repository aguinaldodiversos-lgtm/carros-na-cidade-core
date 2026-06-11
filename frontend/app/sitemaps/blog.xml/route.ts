import { NextResponse } from "next/server";
import { fetchPublishedBlogPosts } from "../../../lib/blog/blog-cms";
import { buildBlogSitemapEntries } from "../../../lib/seo/blog-sitemap";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";

// Fase 4.3 (§10) — sitemap dos posts do Blog do CMS (lacuna anterior).
// ISR 1h; fetchPublishedBlogPosts é cacheado por tag `public-blog`, então
// publicar/despublicar no admin já dispara a revalidação do conteúdo.
export const revalidate = 3600;

export async function GET() {
  let entries: ReturnType<typeof buildBlogSitemapEntries> = [];
  try {
    const { posts } = await fetchPublishedBlogPosts({ limit: 50 });
    entries = buildBlogSitemapEntries(posts);
  } catch {
    // Falha de rede/backend → sitemap vazio (nunca quebra o crawler).
    entries = [];
  }

  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
