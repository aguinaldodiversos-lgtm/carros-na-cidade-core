import { NextRequest, NextResponse } from "next/server";
import { accessTokenNeedsRefresh } from "@/lib/auth/jwt-access";
import { refreshBackendTokens } from "@/lib/auth/refresh-backend-tokens";
import {
  MW_ACCESS_TOKEN_HEADER,
  MW_REFRESH_TOKEN_HEADER,
} from "@/lib/auth/session-headers";
import { createSessionTokenEdge, verifySessionCookieEdge } from "@/lib/session/session-cookie-edge";

const AUTH_COOKIE_NAME = "cnc_session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(MW_ACCESS_TOKEN_HEADER);
  requestHeaders.delete(MW_REFRESH_TOKEN_HEADER);

  const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!sessionToken) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySessionCookieEdge(sessionToken);
  if (!session) {
    if (isApiPath(pathname)) {
      return NextResponse.json({ error: "Sessao invalida" }, { status: 401 });
    }
    return NextResponse.redirect(loginUrl);
  }

  if (!accessTokenNeedsRefresh(session.accessToken)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!session.refreshToken) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Access token expirado. Faca login novamente." },
        { status: 401 }
      );
    }
    return NextResponse.redirect(loginUrl);
  }

  const tokens = await refreshBackendTokens(session.refreshToken);
  if (!tokens) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Nao foi possivel renovar a sessao. Faca login novamente." },
        { status: 401 }
      );
    }
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  const newCookieValue = await createSessionTokenEdge({
    id: session.id,
    name: session.name,
    email: session.email,
    type: session.type,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });

  requestHeaders.set(MW_ACCESS_TOKEN_HEADER, tokens.accessToken);
  requestHeaders.set(MW_REFRESH_TOKEN_HEADER, tokens.refreshToken);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.cookies.set(AUTH_COOKIE_NAME, newCookieValue, getSessionCookieOptions());

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/dashboard-loja/:path*",
    "/impulsionar/:path*",
    "/api/dashboard/me",
    "/api/ads/:path*",
    "/api/payments/create",
    "/api/payments/subscription",
    "/api/plans/eligibility",
  ],
};
