import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE_NAME = "cnc_session";

export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (sessionToken) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard-loja/:path*", "/impulsionar/:path*"],
};
