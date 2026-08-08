// frontend/app/sitemaps/cities.xml/route.ts
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";
import { sitemapResponse } from "../_lib/sitemap-response";

export const dynamic = "force-dynamic";

// SEO 2026-07-04: o backend agora emite o `city_home` já como a URL CANÔNICA
// `/carros-em/[slug]` (fonte = estoque ativo, >= SITEMAP_MIN_ADS). Não há mais
// rewrite `/cidade` → `/comprar/cidade`: o sitemap contém APENAS a canônica de
// cada cidade (nunca `/cidade` nem `/comprar/cidade`).
//
// O try/catch anterior foi removido: `fetchPublicSitemapByTypes` não lança, e o
// `catch` que deveria aplicar TTL curto era código morto. O TTL agora sai de
// `sitemapResponse`, a partir do `ok` do resultado.

export async function GET() {
  return sitemapResponse(await fetchPublicSitemapByTypes(["city_home"], 50000));
}
