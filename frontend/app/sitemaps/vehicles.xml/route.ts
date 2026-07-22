// frontend/app/sitemaps/vehicles.xml/route.ts
//
// Sitemap das páginas de veículo (`/veiculo/[slug]`) — as únicas com conteúdo
// único do portal. Fonte: anúncios ATIVOS da tabela `ads` (endpoint dedicado
// `/api/public/seo/sitemap/vehicles`). Como todos os sitemaps dinâmicos, serve
// urlset vazio quando o backend está fora OU com SITEMAP_PUBLIC_ENABLED=false.
import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../lib/seo/sitemap-xml";
import { fetchPublicVehicleSitemap } from "../../../lib/seo/sitemap-client";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  try {
    const entries = await fetchPublicVehicleSitemap(50000);
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
