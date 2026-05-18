import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  decideRegionalMiddlewareAction,
  extractAncoraParams,
  isFlagEnabled,
  validateAncoraPath,
} from "@/lib/regional-page-guard";

/**
 * Middleware do frontend. Responsabilidades:
 *
 * 1. **Hard gate da Nova Página Regional** (`/:uf/regiao/:ancora`):
 *    - Sem `REGIONAL_PAGE_ENABLED="true"` → 404 HTTP real imediato.
 *    - Com flag on + âncora inválida → 404 HTTP real após validar no
 *      backend (is_ancora = false ou cidade inexistente).
 *    - Com flag on + âncora válida → deixa passar, App Router renderiza.
 *
 *    A rota legada `/carros-usados/regiao/[slug]` foi convertida a
 *    redirect 308 permanente (Fase 4) e não precisa mais de gate —
 *    ela redireciona incondicionalmente, independente da flag.
 *
 *    POR QUE NO MIDDLEWARE em vez de só no page.tsx?
 *    Mesmo motivo da lógica anterior: Next 14.2 pode retornar 200 com
 *    NEXT_NOT_FOUND quando notFound() é chamado depois do <head> ser
 *    flushed. Middleware garante 404 HTTP real.
 *
 * 2. **Redirects 301 de URLs legadas** (existente):
 *    - /carros-{em,baratos-em,automaticos-em}-[slug] → versão com `/`
 *    - /painel/anuncios/novo → /anunciar/novo
 *    - /painel/anuncios/[id]/publicar → /upgrade
 */
/**
 * Header interno usado para passar o pathname da request para os
 * Server Components do App Router (`headers()` em `next/headers`).
 *
 * Por que existe?
 *   O `RootLayout` precisa saber o pathname para resolver a cidade
 *   ativa territorial (ex.: `/carros-em/atibaia-sp` → Atibaia) ANTES
 *   da hidratação client-side. Sem isso, o SSR cai em `DEFAULT_CITY`
 *   (sao-paulo-sp) e os links territoriais do header SSR contradizem
 *   a URL — bug detectado na auditoria 2026-05-11.
 *
 * Como funciona?
 *   - Middleware roda no edge e tem acesso a `request.nextUrl.pathname`.
 *   - `NextResponse.next({ request: { headers: ... } })` injeta os
 *     headers no contexto da request que segue para o App Router.
 *   - Server Components lêem via `headers().get("x-cnc-pathname")`.
 *
 * Por que prefixo `x-cnc-`?
 *   Sinaliza que é header interno da aplicação, não enviado pelo
 *   cliente nem propagado para o navegador.
 */
const PATHNAME_HEADER = "x-cnc-pathname";

function withPathnameHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return { request: { headers: requestHeaders } };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const territorialContext = withPathnameHeader(request);

  // ── 1. Hard gate da Nova Página Regional (`/:uf/regiao/:ancora`). ────
  //
  // A rota `/carros-usados/regiao/[slug]` foi convertida a redirect 308
  // permanente (Fase 4) e NÃO precisa mais de gate aqui — ela sempre
  // redireciona, independente de flag.
  //
  // Esta verificação protege a NOVA rota `/:uf/regiao/:ancora`, pelo mesmo
  // motivo da lógica anterior: Next 14.2 pode retornar status 200 com body
  // NEXT_NOT_FOUND quando `notFound()` é chamado em Server Component depois
  // que o <head> já foi flushed. O middleware garante o status HTTP real.
  const ancoraParams = extractAncoraParams(pathname);
  if (ancoraParams !== null) {
    const flagOn = isFlagEnabled();

    if (!flagOn) {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
      return blocked;
    }

    const validation = await validateAncoraPath(ancoraParams.uf, ancoraParams.ancora);
    const action = decideRegionalMiddlewareAction(flagOn, validation);

    if (action.kind === "pass-valid") {
      const passed = NextResponse.next(territorialContext);
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
    const blocked = new NextResponse(null, { status: 404 });
    blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
    return blocked;
  }

  // ── 1.5. Redirect 308 da rota legada `/carros-usados/regiao/:slug`.
  //
  // POR QUE NO MIDDLEWARE em vez de no page.tsx?
  // O page.tsx usa `permanentRedirect()` (Server Component), mas Next 14.2
  // tem um bug conhecido: se o redirect é chamado após o <head> ter sido
  // flushed via streaming SSR, Next NÃO emite o status HTTP 308 — em vez
  // disso retorna 200 + `<meta http-equiv="refresh">` no body. Isso quebra
  // SEO (crawlers preferem 308 real) e cria flicker visual.
  //
  // O middleware garante 308 HTTP de verdade, antes de qualquer SSR.
  // O page.tsx fica como fallback defensivo caso o matcher mude.
  const legacyRegional = /^\/carros-usados\/regiao\/([a-z0-9-]+)\/?$/.exec(pathname);
  if (legacyRegional?.[1]) {
    const fullSlug = legacyRegional[1].replace(/\/+$/, "");
    const ufMatch = /^(.+)-([a-z]{2})$/.exec(fullSlug);
    if (ufMatch) {
      const url = request.nextUrl.clone();
      url.pathname = `/${ufMatch[2]}/regiao/${ufMatch[1]}`;
      return NextResponse.redirect(url, 308);
    }
    // Slug malformado (sem sufixo -uf) — 404 antes de chegar no page.tsx
    // que faria notFound() (sujeito ao mesmo bug Next 14.2).
    return new NextResponse(null, { status: 404 });
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

  // Fim do middleware: propaga o pathname para o RootLayout via header
  // interno. Isso é benigno para rotas não-territoriais (RootLayout só
  // usa o header se `extractCitySlugFromPathname` reconhecer um prefixo
  // territorial; caso contrário, mantém a lógica antiga de cookie).
  return NextResponse.next(territorialContext);
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
    // Redirects 301 legados (hífen único → barra).
    "/carros-em-:path*",
    "/carros-baratos-em-:path*",
    "/carros-automaticos-em-:path*",

    // Rota legada de região — agora só redireciona (308 permanente).
    // Mantida no matcher para injeção do x-cnc-pathname; não tem gate.
    "/carros-usados/regiao/:path*",

    // Nova rota regional `/:uf/regiao/:ancora` — gate de feature flag
    // + injeção do x-cnc-pathname. O pattern `:uf([a-z]{2})` filtra
    // apenas segmentos de 2 letras minúsculas para não conflitar com
    // rotas existentes como /comprar, /carros-em, etc.
    "/:uf([a-z]{2})/regiao/:path*",

    // Rotas territoriais que precisam do `x-cnc-pathname` para o
    // RootLayout derivar a cidade ativa SSR.
    "/carros-em/:path*",
    "/carros-baratos-em/:path*",
    "/carros-automaticos-em/:path*",
    "/cidade/:path*",
    "/comprar/cidade/:path*",
    "/comprar/estado/:path*",
    "/tabela-fipe/:path*",
    "/simulador-financiamento/:path*",
    "/blog/:path*",

    // Redirects 301 do painel.
    "/painel/anuncios/novo",
    "/painel/anuncios/:id/publicar",
  ],
};
