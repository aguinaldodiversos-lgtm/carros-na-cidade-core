// frontend/app/simulador-financiamento/route.ts
//
// `/simulador-financiamento` é rota de NAVEGAÇÃO: escolhe a cidade e manda para
// `/simulador-financiamento/[cidade]`.
//
// Mesmo tratamento de `/tabela-fipe` (SEO Fase 4.1A) e pelo mesmo motivo: o
// `redirect()` de Server Component saía como HTTP 200 com o shell do layout, e
// o destino sem cookie era `sao-paulo-sp` — cidade sem estoque, logo 404.
//
// DIFERENÇA que importa: esta rota NÃO está em sitemap nenhum, e a página de
// destino `/simulador-financiamento/[cidade]` é `noindex, follow` por decisão
// de produto (ferramenta interativa; ver o comentário em
// `lib/seo/sitemap-static.ts`). Essa política fica INTACTA — aqui só corrigimos
// o destino quebrado e a forma do redirect. Não tornamos a rota indexável nem a
// reintroduzimos em sitemap.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { resolveTerritorialIndexTarget } from "@/lib/city/territorial-index-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const target = await resolveTerritorialIndexTarget("simulador-financiamento", fromCookie?.slug);

  // 307: destino depende do cookie e do estoque vivo — não é permanente.
  return NextResponse.redirect(new URL(target, request.url), 307);
}
