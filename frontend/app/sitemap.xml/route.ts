export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { detectAvailableStates } from "../../lib/seo/sitemap-client";
import { buildSitemapIndexXml } from "../../lib/seo/sitemap-xml";

/**
 * Índice de sitemaps.
 *
 * ── Sem `lastmod` ────────────────────────────────────────────────────────────
 * A versão anterior carimbava `new Date()` em TODOS os filhos a cada request, o
 * que afirma "os 10 sitemaps mudaram agora" em toda leitura. O `lastmod` do
 * índice deveria refletir quando cada filho mudou de fato — dado que não temos
 * aqui, já que os filhos são gerados sob demanda. Um carimbo sempre-atual não é
 * informação; é ruído que ensina o Google a ignorar o campo, inclusive onde ele
 * é verdadeiro (anúncios e posts carregam `updated_at` real).
 *
 * ── Quem entra no índice (Fase 2B.1) ─────────────────────────────────────────
 * O índice é uma recomendação de onde gastar crawl budget. Anunciar um filho
 * que sempre responde `<urlset></urlset>` gasta uma requisição do Googlebot
 * para dizer nada — de novo, a cada visita.
 *
 * Ficam de fora, por enquanto:
 *
 *   local-seo.xml      vazio POR DESIGN — as três landings que ele listaria
 *                      canonicalizam para outras famílias (ver
 *                      `_lib/transition-helpers.ts`). Enquanto isso for
 *                      verdade, ele nunca terá URL.
 *   opportunities.xml  vazio POR DESIGN — `/cidade/[slug]/oportunidades`
 *                      canonicaliza para `/abaixo-da-fipe`, que já está em
 *                      `below-fipe.xml`.
 *
 * As ROTAS continuam existindo (não quebram links externos nem submissões
 * antigas no Search Console); elas só deixam de ser recomendadas.
 *
 * `models.xml` FICA, e a distinção importa: ele está vazio por FALTA DE
 * ESTOQUE, não por design. Medido em 2026-08-07: o modelo mais frequente tem 2
 * anúncios e o limiar é 3. É uma condição temporária que se resolve sozinha
 * quando o inventário crescer — e aí o índice já estará apontando para ele.
 */
const FIXED_SITEMAPS = [
  "/sitemaps/core.xml",
  "/sitemaps/content.xml",
  "/sitemaps/cities.xml",
  "/sitemaps/brands.xml",
  // Vazio hoje por falta de estoque (limiar de 3 anúncios por modelo), não por
  // design. Fica anunciado para que o dia em que houver estoque não dependa de
  // alguém lembrar de reinseri-lo aqui.
  "/sitemaps/models.xml",
  "/sitemaps/below-fipe.xml",
  "/sitemaps/blog.xml",
  "/sitemaps/vehicles.xml",
];

export async function GET() {
  let states: string[] = [];
  try {
    states = await detectAvailableStates();
  } catch {
    // `detectAvailableStates` já não lança, mas o guard fica: perder os
    // regionais é degradação aceitável; derrubar o índice inteiro não é.
    states = [];
  }

  const xml = buildSitemapIndexXml([
    ...FIXED_SITEMAPS.map((loc) => ({ loc })),
    // Só UF com cidade publicável. A detecção vem das entradas de `city_home`,
    // que já nascem filtradas por estoque ativo — o regional não pode aparecer
    // aqui anunciando cidade que responde 404, que era o estado até a Fase 2B.1.
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
