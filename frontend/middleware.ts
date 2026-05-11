import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  decideRegionalMiddlewareAction,
  extractRegionalSlug,
  isFlagEnabled,
  validateRegionalSlug,
} from "@/lib/regional-page-guard";

/**
 * Middleware do frontend. Responsabilidades:
 *
 * 1. **Hard gate da Página Regional** (`/carros-usados/regiao/:slug`):
 *    - Sem `REGIONAL_PAGE_ENABLED="true"` → 404 HTTP real imediato.
 *    - Com flag on + slug inválido → 404 HTTP real após validar no
 *      backend.
 *    - Com flag on + slug válido → deixa passar, App Router renderiza.
 *
 *    POR QUE NO MIDDLEWARE em vez de só no page.tsx?
 *    No Next 14.2 App Router, `notFound()` dentro de Server Component
 *    pode retornar status 200 (o `<head>` já foi flushed; o status code
 *    foi comitado). Reproduzido em produção em 2026-05-10: smoke
 *    contra rota regional com flag off retornava 200 + body com
 *    `data-dgst="NEXT_NOT_FOUND"`. Middleware roda ANTES do App
 *    Router, então `NextResponse(null, { status: 404 })` aqui garante
 *    o status real.
 *
 *    A page.tsx mantém o gate interno (`notFound()`) como defesa em
 *    profundidade — se o middleware falhar/for desativado, a página
 *    ainda recusa renderizar.
 *
 * 2. **Redirects 301 de URLs legadas** (existente):
 *    - /carros-{em,baratos-em,automaticos-em}-[slug] → versão com `/`
 *    - /painel/anuncios/novo → /anunciar/novo
 *    - /painel/anuncios/[id]/publicar → /upgrade
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Hard gate da Regional (antes de qualquer outra lógica). ─────
  //
  // IMPORTANTE: a decisão de "é rota regional?" é feita aqui dentro via
  // `extractRegionalSlug` (regex testado), NÃO pelo matcher do Next.
  // Validamos empiricamente que o `path-to-regexp` do Next 14 com
  // `/carros-usados/regiao/:slug` no matcher NÃO casava em produção
  // (rota chegava no App Router sem passar pelo middleware). Mover o
  // pattern matching para dentro elimina a dependência de quirks do
  // matcher e usa o regex que já tem cobertura unit (20 testes).
  const regionalSlug = extractRegionalSlug(pathname);
  if (regionalSlug !== null) {
    const flagOn = isFlagEnabled();

    // Curto-circuito explícito: flag off NÃO chama o backend para evitar
    // tráfego desnecessário e cold-start spurious. O decisor abaixo
    // também lida com flag off, mas pular o fetch aqui é eficiência pura.
    if (!flagOn) {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
      return blocked;
    }

    const validation = await validateRegionalSlug(regionalSlug);
    const action = decideRegionalMiddlewareAction(flagOn, validation);

    // Política de decisão (ver `decideRegionalMiddlewareAction` para
    // racional): `unavailable` NUNCA passa para o App Router porque
    // o `notFound()` da page.tsx no Next 14.2 retorna soft 404 (200
    // com body NEXT_NOT_FOUND), problema reproduzido em produção em
    // 2026-05-11. 503 com `Retry-After` é a resposta correta para
    // "não consegui validar" — semanticamente honesta, SEO-safe.
    if (action.kind === "pass-valid") {
      const passed = NextResponse.next();
      passed.headers.set("X-Middleware-Regional", "passed-valid");
      return passed;
    }
    if (action.kind === "block-not-found") {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Regional", "blocked-slug-invalid");
      return blocked;
    }
    if (action.kind === "block-unavailable") {
      const blocked = new NextResponse(null, { status: 503 });
      blocked.headers.set("X-Middleware-Regional", "blocked-unavailable");
      blocked.headers.set("X-Middleware-Regional-Reason", action.reason);
      blocked.headers.set("Retry-After", "60");
      return blocked;
    }
    // block-flag-off — defesa em profundidade. O curto-circuito acima já
    // tratou flag=off, mas o tipo do `action` permite esse caminho e o
    // exhaustive-check torna a função type-safe contra novas variantes.
    const blocked = new NextResponse(null, { status: 404 });
    blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
    return blocked;
  }

  // ── 2. Redirects 301 legados (preservados como estavam). ───────────

  const hyphenEm = /^\/carros-em-([^/]+)\/?$/.exec(pathname);
  if (hyphenEm?.[1]) {
    const slug = hyphenEm[1].replace(/\/+$/, "");
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/carros-em/${slug}`;
      return NextResponse.redirect(url, 301);
    }
  }

  const hyphenBaratos = /^\/carros-baratos-em-([^/]+)\/?$/.exec(pathname);
  if (hyphenBaratos?.[1]) {
    const slug = hyphenBaratos[1].replace(/\/+$/, "");
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/carros-baratos-em/${slug}`;
      return NextResponse.redirect(url, 301);
    }
  }

  const hyphenAuto = /^\/carros-automaticos-em-([^/]+)\/?$/.exec(pathname);
  if (hyphenAuto?.[1]) {
    const slug = hyphenAuto[1].replace(/\/+$/, "");
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = `/carros-automaticos-em/${slug}`;
      return NextResponse.redirect(url, 301);
    }
  }

  if (pathname === "/painel/anuncios/novo") {
    const url = request.nextUrl.clone();
    url.pathname = "/anunciar/novo";
    return NextResponse.redirect(url, 301);
  }

  const upgradeMatch = /^\/painel\/anuncios\/([^/]+)\/publicar\/?$/.exec(pathname);
  if (upgradeMatch?.[1]) {
    const url = request.nextUrl.clone();
    url.pathname = `/painel/anuncios/${upgradeMatch[1]}/upgrade`;
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

/**
 * Matcher do middleware.
 *
 * Decisões:
 *  - `/carros-usados/regiao/:path*` (não `/carros-usados/regiao/:slug`):
 *    `:path*` casa zero ou mais segmentos e é o pattern mais robusto no
 *    `path-to-regexp` do Next 14. O matcher só decide SE o middleware
 *    roda; a validação fina de "é rota regional válida?" é feita
 *    dentro do código via `extractRegionalSlug`.
 *  - As rotas legadas com hífen único (`/carros-em-foo`, etc.) usam
 *    `/:slug` com path completo porque `:slug` no MEIO do segmento
 *    (sem `/` antes) é interpretado de forma inconsistente. Para essas,
 *    pegamos via path mais amplo e validamos dentro.
 *  - `/painel/anuncios/novo` é match exato — sem parâmetro, funciona.
 *  - `/painel/anuncios/:id/publicar` usa `:id` separado por `/`, que
 *    é o caso canônico que `path-to-regexp` cata sem ambiguidade.
 */
export const config = {
  matcher: [
    "/carros-usados/regiao/:path*",
    "/carros-em-:path*",
    "/carros-baratos-em-:path*",
    "/carros-automaticos-em-:path*",
    "/painel/anuncios/novo",
    "/painel/anuncios/:id/publicar",
  ],
};
