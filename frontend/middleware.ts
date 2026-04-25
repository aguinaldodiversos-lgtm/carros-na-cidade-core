import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * URLs legadas → canônico (SEO local + rotas legadas).
 *
 * 1. /carros-{em,baratos-em,automaticos-em}-[slug] → /carros-{...}/[slug]
 *    (URLs antigas com hífen único; preservadas para SEO local).
 * 2. /painel/anuncios/novo → /anunciar/novo
 *    (rota legada do painel; fluxo oficial agora é /anunciar/novo).
 *    Preserva query params via clone().
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // Rota legada do painel (preserva query string).
  if (pathname === "/painel/anuncios/novo") {
    const url = request.nextUrl.clone();
    url.pathname = "/anunciar/novo";
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/carros-em-:slug",
    "/carros-baratos-em-:slug",
    "/carros-automaticos-em-:slug",
    "/painel/anuncios/novo",
  ],
};
