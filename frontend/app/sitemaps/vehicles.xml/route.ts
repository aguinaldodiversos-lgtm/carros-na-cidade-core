// frontend/app/sitemaps/vehicles.xml/route.ts
//
// Sitemap das páginas de veículo (`/veiculo/[slug]`) — as únicas com conteúdo
// único do portal. Fonte: anúncios ATIVOS da tabela `ads` (endpoint dedicado
// `/api/public/seo/sitemap/vehicles`). Quando o backend está fora OU com
// SITEMAP_PUBLIC_ENABLED=false, serve urlset vazio com TTL CURTO — ver
// `_lib/sitemap-response.ts` para a regra e o porquê.
import { fetchPublicVehicleSitemap } from "../../../lib/seo/sitemap-client";
import { sitemapResponse } from "../_lib/sitemap-response";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  return sitemapResponse(await fetchPublicVehicleSitemap(50000));
}
