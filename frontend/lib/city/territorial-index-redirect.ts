// frontend/lib/city/territorial-index-redirect.ts
//
// Destino das rotas-ÍNDICE territoriais (`/tabela-fipe`, `/simulador-financiamento`).
//
// ── O defeito (SEO Fase 4.1A, achado P1-3) ───────────────────────────────────
// As duas rotas eram `page.tsx` fazendo
//
//     redirect(`/tabela-fipe/${cookie?.slug ?? DEFAULT_PUBLIC_CITY_SLUG}`)
//
// com dois problemas somados, ambos medidos em produção em 2026-08-31:
//
//   1. O destino sem cookie era `sao-paulo-sp` — cidade com ZERO anúncios
//      ativos, que o gate territorial responde 404. `/tabela-fipe` estava em
//      `core.xml`, ou seja: o sitemap anunciava uma URL que mandava o visitante
//      para um 404.
//
//   2. O `redirect()` de Server Component rodava DEPOIS de o shell do layout
//      raiz ter começado a streamar, então a resposta saía
//
//          HTTP 200  +  <title> do layout  +  canonical "/"  +  NEXT_REDIRECT
//
//      Para o crawler isso não é redirect nenhum: é uma página 200, indexável,
//      canonicalizando para a home. Era a única violação de canonical entre as
//      53 URLs do sitemap.
//
// A correção do item 2 é servir as rotas por Route Handler (sem layout, sem
// streaming), que emite um 307 de verdade. A do item 1 é esta função.
//
// ── 307, não 308 ─────────────────────────────────────────────────────────────
// O destino DEPENDE do cookie do visitante e do estoque vivo — pode ser
// `/tabela-fipe/atibaia-sp` hoje e outra cidade amanhã. 308 (permanente) diria
// ao Google que a associação é definitiva e faria o navegador cachear o
// destino. 307 é a semântica correta: temporário, revalidado a cada visita.

import { fetchPublicCitySet, isPublicCity } from "@/lib/city/public-city-set";

/** Fallback genérico quando o portal não tem NENHUMA cidade pública. */
export const TERRITORIAL_INDEX_FALLBACK = "/comprar";

/**
 * Para onde `/{prefix}` deve mandar o visitante.
 *
 * Ordem:
 *   1. Cidade do cookie — **só se ainda for pública**. Cookie de cidade que
 *      perdeu o estoque é justamente o caso que produz 404.
 *   2. Cidade pública primária (maior estoque; empate por slug ASC), derivada
 *      no backend a partir da mesma consulta do conjunto público.
 *   3. `/comprar` — a vitrine nacional. 200, indexável, autocanônica. Não
 *      inventamos slug de cidade: sem estoque em lugar nenhum, não existe
 *      página territorial para onde mandar.
 *
 * Backend indisponível (`set === null`) cai no passo 3. Preferimos mandar para
 * uma página que existe a apostar num slug que talvez responda 404.
 */
export async function resolveTerritorialIndexTarget(
  prefix: string,
  cookieSlug: string | null | undefined
): Promise<string> {
  const set = await fetchPublicCitySet();

  const cookieCandidate = String(cookieSlug || "").trim();
  if (cookieCandidate && isPublicCity(set, cookieCandidate)) {
    return `/${prefix}/${encodeURIComponent(cookieCandidate)}`;
  }

  const primary = set?.primaryCity?.slug;
  if (primary) {
    return `/${prefix}/${encodeURIComponent(primary)}`;
  }

  return TERRITORIAL_INDEX_FALLBACK;
}
