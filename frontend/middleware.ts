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
 * 1. **Hard gate da Página Regional canônica** (`/carros-usados/regiao/:slug`):
 *    - Sem `REGIONAL_PAGE_ENABLED="true"` → 404 HTTP real imediato.
 *    - Com flag on + slug inválido (cidade não existe) → 404 HTTP real.
 *    - Com flag on + slug válido → deixa passar, App Router renderiza.
 *
 *    A URL canônica é `/carros-usados/regiao/{citySlug}` onde `citySlug`
 *    é o slug canônico da cidade-base no formato `nome-uf` (regex
 *    `^[a-z0-9-]+-[a-z]{2}$`). Exemplos: `atibaia-sp`, `campinas-sp`,
 *    `belo-horizonte-mg`. O slug aceita qualquer cidade brasileira com
 *    coordenadas — a Página Regional é universal (Fase 5).
 *
 *    POR QUE NO MIDDLEWARE em vez de só no page.tsx?
 *    Next 14.2 pode retornar 200 com `NEXT_NOT_FOUND` quando `notFound()`
 *    é chamado depois do `<head>` ser flushed. Middleware garante 404
 *    HTTP real para slugs inválidos.
 *
 * 2. **Redirect 301 da rota legada** (`/:uf/regiao/:ancora`):
 *    - Sempre redireciona para `/carros-usados/regiao/{ancora}-{uf}`,
 *      sem validar slug aqui (a canônica valida via gate quando chega).
 *    - Esta rota existiu brevemente na Fase 4 (2026-05-17) como tentativa
 *      de canônica curta — Fase 5 (2026-05-18) reverteu para o slug
 *      completo `nome-uf` por alinhamento com `/carros-em/[slug]` e
 *      simplificação de partições de URL.
 *
 * 3. **Redirects 301 de outras URLs legadas** (preservados):
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
 *   e os links territoriais do header SSR contradizem a URL — bug
 *   detectado na auditoria 2026-05-11.
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

// Padrão da rota legada `/:uf/regiao/:ancora` que será redirecionada
// 301 para `/carros-usados/regiao/{ancora}-{uf}`. UF deve ser 2 letras.
const LEGACY_ANCORA_RE = /^\/([a-z]{2})\/regiao\/([a-z0-9-]+)\/?$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const territorialContext = withPathnameHeader(request);

  // ── 1. Redirect 301 da rota legada `/:uf/regiao/:ancora` para canônica.
  //
  // Esta rota não tem gate de feature flag — sempre redireciona, mesmo
  // com REGIONAL_PAGE_ENABLED=false. A canônica fará seu próprio gate
  // quando o request chegar lá. Isso simplifica o invariante: o legado
  // SEMPRE virou para o canônico.
  const legacyAncoraMatch = LEGACY_ANCORA_RE.exec(pathname);
  if (legacyAncoraMatch) {
    const [, uf, ancora] = legacyAncoraMatch;
    const canonicalSlug = `${ancora}-${uf}`;
    const url = request.nextUrl.clone();
    url.pathname = `/carros-usados/regiao/${canonicalSlug}`;
    return NextResponse.redirect(url, 301);
  }

  // ── 2. Hard gate da Página Regional canônica `/carros-usados/regiao/:slug`.
  //
  // O slug é o citySlug canônico (`nome-uf`). Validamos:
  //   - feature flag REGIONAL_PAGE_ENABLED
  //   - slug existe no DB (cidade com coordenadas válidas)
  //
  // Cidades sem coordenadas válidas: o backend retorna 404 e o gate
  // bloqueia aqui — evita renderização de uma região impossível.
  const regionalSlug = extractRegionalSlug(pathname);
  if (regionalSlug !== null) {
    const flagOn = isFlagEnabled();

    if (!flagOn) {
      const blocked = new NextResponse(null, { status: 404 });
      blocked.headers.set("X-Middleware-Regional", "blocked-flag-off");
      return blocked;
    }

    const validation = await validateRegionalSlug(regionalSlug);
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

  // ── 3. Redirects 301 legados (hífen único → barra). ────────────────

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
 *  - `/carros-usados/regiao/:path*`: gate hard-404 da canônica.
 *  - `/:uf([a-z]{2})/regiao/:path*`: redirect 301 da legada.
 *  - Demais rotas territoriais entram para injeção do `x-cnc-pathname`.
 */
export const config = {
  matcher: [
    // Página Regional canônica — gate de feature flag + validação de slug.
    "/carros-usados/regiao/:path*",

    // Página Regional legada — redirect 301 para canônica (sem gate).
    "/:uf([a-z]{2})/regiao/:path*",

    // Redirects 301 legados (hífen único → barra).
    "/carros-em-:path*",
    "/carros-baratos-em-:path*",
    "/carros-automaticos-em-:path*",

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
