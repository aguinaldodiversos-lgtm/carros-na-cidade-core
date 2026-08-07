export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { detectAvailableStates } from "../../lib/seo/sitemap-client";
import { buildSitemapIndexXml } from "../../lib/seo/sitemap-xml";

/**
 * Índice de sitemaps.
 *
 * Sem `lastmod`: a versão anterior carimbava `new Date()` em TODOS os filhos a
 * cada request, o que afirma "os 10 sitemaps mudaram agora" em toda leitura. O
 * `lastmod` do índice deveria refletir quando cada filho mudou de fato — dado
 * que não temos aqui, já que os filhos são gerados sob demanda. Um carimbo
 * sempre-atual não é informação; é ruído que ensina o Google a ignorar o campo,
 * inclusive onde ele é verdadeiro (anúncios e posts carregam `updated_at` real).
 */
export async function GET() {
  const fixedSitemaps = [
    "/sitemaps/core.xml",
    "/sitemaps/content.xml",
    "/sitemaps/cities.xml",
    "/sitemaps/local-seo.xml",
    "/sitemaps/brands.xml",
    "/sitemaps/models.xml",
    "/sitemaps/opportunities.xml",
    "/sitemaps/below-fipe.xml",
    "/sitemaps/blog.xml",
    "/sitemaps/vehicles.xml",
  ];

  let states: string[] = [];
  try {
    states = await detectAvailableStates();
  } catch {
    states = [];
  }

  const xml = buildSitemapIndexXml([
    ...fixedSitemaps.map((loc) => ({ loc })),
    // `detectAvailableStates()` já devolve só UF com conteúdo público — o
    // índice nunca aponta para um sitemap regional vazio.
    ...states.map((state) => ({ loc: `/sitemaps/regiao/${state.toLowerCase()}.xml` })),
  ]);

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
