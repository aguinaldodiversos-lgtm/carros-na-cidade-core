import { NextResponse } from "next/server";
import { getStaticCitySlugs } from "../../../lib/market/market-data";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const lastmod = new Date().toISOString();
  const citySlugs = getStaticCitySlugs(5000);
  // ATENÇÃO (SEO 2026-07-03): NÃO reintroduzir `/simulador-financiamento/[cidade]`
  // aqui. A rota é `noindex` (ferramenta interativa) e este bloco chegava a
  // emitir ~5.000 URLs noindex no sitemap — o que fez o Google descobrir e
  // rastrear em massa as páginas-fantasma `?veiculo=`. Sitemap só pode conter
  // URLs 200 + canônicas + index. `/blog/[cidade]` e `/tabela-fipe/[cidade]`
  // são indexáveis e permanecem.
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
