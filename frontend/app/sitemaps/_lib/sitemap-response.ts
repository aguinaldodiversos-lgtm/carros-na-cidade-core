// frontend/app/sitemaps/_lib/sitemap-response.ts
//
// Resposta HTTP única de todos os sitemaps dinâmicos.
//
// Existe por causa do incidente 2026-07-27: os 7 route.ts repetiam o mesmo
// bloco try/catch, e nele o `catch` — que serviria TTL curto em falha — era
// INALCANÇÁVEL, porque `fetchSitemapEntries` nunca lançava. O urlset vazio
// saía pelo caminho de sucesso e era cacheado por 3600s, igual ao acerto. Um
// 429 de um segundo congelava o sitemap vazio por uma hora, e como nada logava
// o estado durou semanas sem ser notado.
//
// Centralizar aqui garante que a regra de TTL não possa divergir entre rotas.

import { NextResponse } from "next/server";

import { buildSitemapXml } from "@/lib/seo/sitemap-xml";
import type { PublicSitemapEntry, SitemapFetchResult } from "@/lib/seo/sitemap-client";

/** TTL do acerto: sitemap com URLs, vindo de backend saudável. */
export const SITEMAP_TTL_OK_SECONDS = 3600;

/**
 * TTL do degradado. Curto DE PROPÓSITO: é o intervalo máximo que um sitemap
 * errado fica publicado antes da próxima tentativa. Não baixar mais que isso
 * sem medir carga — cada expiração é um novo fanout contra o cap do backend.
 */
export const SITEMAP_TTL_DEGRADED_SECONDS = 300;

/**
 * Um urlset VAZIO nunca recebe TTL longo, mesmo com `ok: true`.
 *
 * Vazio legítimo existe (nenhuma cidade atinge SITEMAP_MIN_ADS), mas é barato
 * reconsultar — é um documento vazio. Já um vazio causado por falha que
 * escapou da detecção custa uma hora de URLs fora do índice. Com a assimetria
 * nessa proporção, a regra conservadora é a única defensável:
 *
 *     TTL longo  ⟺  ok === true && entries.length > 0
 *
 * É essa bicondicional que o teste em `sitemap-response.test.ts` trava.
 */
export function shouldUseLongTtl(result: SitemapFetchResult): boolean {
  return result.ok && result.entries.length > 0;
}

export function sitemapCacheControl(result: SitemapFetchResult): string {
  return shouldUseLongTtl(result)
    ? `public, s-maxage=${SITEMAP_TTL_OK_SECONDS}, stale-while-revalidate=86400`
    : `public, s-maxage=${SITEMAP_TTL_DEGRADED_SECONDS}, stale-while-revalidate=3600`;
}

/**
 * 503 do sitemap — a resposta de "não consegui verificar".
 *
 * A versão anterior servia SEMPRE 200, com o argumento de que "um 5xx faria o
 * Google marcar o sitemap como erro e parar de lê-lo". O argumento se voltou
 * contra si: medido em 2026-08-07, processo novo + backend fora devolvia
 *
 *     HTTP 200  +  <urlset></urlset>
 *
 * para cities, vehicles, brands, models, blog e regional. Um sitemap vazio não
 * é "erro que o Google ignora" — é a AFIRMAÇÃO de que aquelas URLs não existem
 * mais. É estritamente pior que o 503, que o Google trata como transitório e
 * reagenda.
 *
 * Só chega aqui quem esgotou as três camadas: resposta fresca, memória do
 * processo e snapshot persistente.
 */
function sitemapUnavailableResponse(): NextResponse {
  return new NextResponse("Sitemap temporariamente indisponível", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "60",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

/**
 * Monta a resposta aplicando as regras de status e de TTL.
 *
 * Status:
 *   `fresh` / `memory-stale` / `redis-stale` → 200 com o urlset
 *   `unavailable`                            → 503
 *
 * Note que `fresh` com ZERO URLs continua 200: a consulta funcionou e a
 * resposta é "não há URLs". `models.xml` vive nesse caso enquanto nenhum modelo
 * atinge o limiar — vazio legítimo, não falha.
 */
export function sitemapResponse(result: SitemapFetchResult): NextResponse {
  if (result.source === "unavailable") return sitemapUnavailableResponse();

  return new NextResponse(buildSitemapXml(result.entries), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": sitemapCacheControl(result),
    },
  });
}

/**
 * Para rotas cujas entries são derivadas (ex.: `content.xml`, que transforma
 * `city_home` em `/blog/[slug]` + `/tabela-fipe/[slug]`): herda `ok` E `source`
 * da origem.
 *
 * Herdar `source` é o que faz a derivação de uma fonte indisponível virar 503
 * em vez de 200 vazio. Sem isso, `content.xml` transformaria "não sei" em
 * "não há conteúdo" — a mesma troca que esta fase existe para eliminar.
 */
export function sitemapResponseFrom(
  source: SitemapFetchResult,
  entries: PublicSitemapEntry[]
): NextResponse {
  return sitemapResponse({
    entries,
    ok: source.ok,
    source: source.source,
    reason: source.reason,
  });
}

/**
 * Sitemaps montados em memória, sem backend (core, local-seo, opportunities).
 *
 * `source: "fresh"` é literalmente verdade aqui: não há consulta que possa
 * falhar, então o resultado é sempre uma afirmação — inclusive quando é uma
 * lista vazia por design.
 */
export function staticSitemapResponse(entries: PublicSitemapEntry[]): NextResponse {
  return sitemapResponse({ entries, ok: true, source: "fresh" });
}
