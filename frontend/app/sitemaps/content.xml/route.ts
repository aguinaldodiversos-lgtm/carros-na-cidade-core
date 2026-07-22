import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByTypes } from "../../../lib/seo/sitemap-client";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

// SEO (2026-07-21): antes este bloco emitia `/blog/[cidade]` + `/tabela-fipe/[cidade]`
// para uma lista HARDCODED de 41 cidades-seed, sem checar estoque — publicando
// cidades-fantasma (Manaus, Macapá, Boa Vista…) que nunca tiveram anúncio. Agora
// usa a MESMA lista gateada por inventário do `cities.xml` (tipo `city_home`, só
// cidades com >= SITEMAP_MIN_ADS anúncios ativos). Cada `loc` gateado vem como
// `/carros-em/{slug}`; derivamos o slug e emitimos as duas páginas de conteúdo.
// Cidade sem estoque sai do sitemap (as páginas seguem 200/indexáveis, só não
// são listadas). ATENÇÃO: NÃO reintroduzir `/simulador-financiamento/[cidade]`
// (rota noindex — listá-la em massa fez o Google rastrear as páginas-fantasma
// `?veiculo=`). Sitemap só pode conter URLs 200 + canônicas + index.
export async function GET() {
  try {
    const cityEntries = await fetchPublicSitemapByTypes(["city_home"], 50000);
    const fallbackLastmod = new Date().toISOString();

    const entries = cityEntries.flatMap((entry) => {
      const slug = String(entry.loc || "")
        .replace(/^\/carros-em\//, "")
        .trim();
      // Guard: só slugs de cidade (o city_home é sempre `/carros-em/{slug}`).
      if (!slug || slug.includes("/")) return [];

      const lastmod =
        typeof entry.lastmod === "string" && entry.lastmod ? entry.lastmod : fallbackLastmod;

      return [
        {
          loc: `/blog/${slug}`,
          lastmod,
          changefreq: "weekly",
          priority: 0.6,
        },
        {
          loc: `/tabela-fipe/${slug}`,
          lastmod,
          changefreq: "weekly",
          priority: 0.7,
        },
      ];
    });

    const xml = buildSitemapXml(entries);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    // fallback: não quebrar build/runtime se a API estiver fora
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
