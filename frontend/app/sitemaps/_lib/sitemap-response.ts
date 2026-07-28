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
 * Monta a resposta XML aplicando a regra de TTL acima.
 *
 * Sempre HTTP 200: um 5xx faria o Google marcar o sitemap como erro e parar de
 * lê-lo. Servimos urlset (possivelmente vazio) com TTL curto e seguimos.
 */
export function sitemapResponse(result: SitemapFetchResult): NextResponse {
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
 * `city_home` em `/blog/[slug]` + `/tabela-fipe/[slug]`): preserva o `ok` da
 * origem, senão uma derivação de fonte degradada seria servida como sucesso.
 */
export function sitemapResponseFrom(
  source: SitemapFetchResult,
  entries: PublicSitemapEntry[]
): NextResponse {
  return sitemapResponse({ entries, ok: source.ok });
}

/** Sitemaps estáticos (core, local-seo, opportunities): sempre TTL longo. */
export function staticSitemapResponse(entries: PublicSitemapEntry[]): NextResponse {
  return sitemapResponse({ entries, ok: true });
}
