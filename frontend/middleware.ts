import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * URLs legadas com hífen → canônico com barra (SEO local).
 * As rotas /carros-*-em/[slug] são SSR; não redirecionar para /comprar.
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/carros-em-:slug",
    "/carros-baratos-em-:slug",
    "/carros-automaticos-em-:slug",
  ],
};
