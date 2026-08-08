import { fetchPublicBlogSitemap } from "../../../lib/seo/sitemap-client";
import { buildBlogSitemapEntries } from "../../../lib/seo/blog-sitemap";
import type { CmsBlogPost } from "@/lib/blog/blog-cms";
import { sitemapResponse } from "../_lib/sitemap-response";

/**
 * Sitemap dos posts publicados do Blog do CMS (`/blog/[slug]`).
 *
 * ── O caso especial que este arquivo deixou de ser (Fase 2B.1) ───────────────
 * Era o único sitemap fora da política central. Tinha `try/catch` próprio com
 *
 *     catch { entries = [] }
 *
 * e devolvia `200` com urlset vazio e `s-maxage=3600`. Ou seja: uma falha
 * momentânea do backend publicava "não há posts" e CONGELAVA essa afirmação
 * por uma hora — o pior comportamento entre todos os sitemaps, e exatamente o
 * anti-padrão que `sitemap-response.ts` foi escrito para eliminar. Ele ficou
 * de fora porque nasceu depois, com fetch próprio.
 *
 * Agora passa por `fetchPublicBlogSitemap` + `sitemapResponse`, herdando as
 * quatro camadas: resposta fresca → memória → snapshot no Redis → 503.
 *
 * O `revalidate` continua sendo o do fetch (1 h, dentro do cliente) e a tag
 * `public-blog` segue invalidando o conteúdo quando o admin publica.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchPublicBlogSitemap(50, (posts) =>
    buildBlogSitemapEntries(posts as CmsBlogPost[])
  );

  return sitemapResponse(result);
}
