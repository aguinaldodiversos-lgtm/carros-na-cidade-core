// frontend/app/tabela-fipe/route.ts
//
// `/tabela-fipe` é rota de NAVEGAÇÃO: não tem conteúdo próprio, só escolhe a
// cidade e manda para `/tabela-fipe/[cidade]`.
//
// ── Por que Route Handler e não `page.tsx` (SEO Fase 4.1A, achado P1-3) ──────
// Era um Server Component chamando `redirect()`. Como o `redirect()` acontecia
// depois de o shell do layout raiz começar a streamar, a resposta medida em
// produção era:
//
//     HTTP 200 · <meta name="robots" content="index, follow">
//     <link rel="canonical" href="https://www.carrosnacidade.com">   ← a HOME
//     corpo com NEXT_REDIRECT → /tabela-fipe/sao-paulo-sp            ← 404
//
// Ou seja: uma URL listada em `core.xml`, indexável, canonicalizando para outra
// página e entregando um 404 ao visitante. Route Handler não monta layout e não
// streama — o 307 sai como 307 de verdade.
//
// A URL saiu do `core.xml` na mesma fase: sitemap não pode conter redirect
// (ver `lib/seo/sitemap-static.ts`). A rota continua existindo e continua
// linkada pelo chrome do site; ela só deixou de ser recomendada ao crawler.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { resolveTerritorialIndexTarget } from "@/lib/city/territorial-index-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const target = await resolveTerritorialIndexTarget("tabela-fipe", fromCookie?.slug);

  // 307: o destino depende do cookie e do estoque vivo — não é permanente.
  return NextResponse.redirect(new URL(target, request.url), 307);
}
