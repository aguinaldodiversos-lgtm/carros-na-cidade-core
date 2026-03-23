import { NextRequest, NextResponse } from "next/server";
import { getSessionDataFromCookieValue } from "@/services/sessionService";

const AUTH_COOKIE_NAME = "cnc_session";

export function middleware(request: NextRequest) {
  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  // Valida HMAC + expiração via sessionService — não aceita cookie forjado ou expirado
  const session = getSessionDataFromCookieValue(cookieValue);

  if (session?.id) {
    return NextResponse.next();
  }

  // Cookie ausente, inválido ou expirado → redireciona para login
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard-loja/:path*", "/impulsionar/:path*", "/conta"],
};
