import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AccountType } from "@/lib/dashboard-types";
import { MW_ACCESS_TOKEN_HEADER, MW_REFRESH_TOKEN_HEADER } from "@/lib/auth/session-headers";

export const AUTH_COOKIE_NAME = "cnc_session";

/** JWTs em cookie separado evitam ultrapassar o limite ~4KB do header Set-Cookie (sessão assinada + 2 tokens). */
export const AUTH_ACCESS_COOKIE_NAME = "cnc_at";
export const AUTH_REFRESH_COOKIE_NAME = "cnc_rt";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  type: AccountType;
};

export type SessionData = SessionUser & {
  accessToken?: string;
  refreshToken?: string;
};

type SessionPayload = SessionUser & {
  iat: number;
  exp: number;
  /** Legado: tokens embutidos no JSON (antes da divisão em cookies separados). */
  accessToken?: string;
  refreshToken?: string;
};

const DEFAULT_DURATION_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET deve ser definido em producao.");
  }
  return "cnc-dev-session-secret";
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTokenBody(body: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
}

/**
 * Cookie assinado só com dados do usuário (sem JWTs), para ficar bem abaixo do limite de tamanho.
 * Os tokens vão em {@link AUTH_ACCESS_COOKIE_NAME} e {@link AUTH_REFRESH_COOKIE_NAME}.
 */
export function createSessionToken(user: SessionData, maxAgeSeconds = DEFAULT_DURATION_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    iat: now,
    exp: now + maxAgeSeconds,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signTokenBody(body);
  return `${body}.${signature}`;
}

export function getTokenCookieOptions(maxAgeSeconds = DEFAULT_DURATION_SECONDS) {
  return getSessionCookieOptions(maxAgeSeconds);
}

export function getClearTokenCookieOptions() {
  return getClearSessionCookieOptions();
}

/**
 * Define `cnc_session` + cookies httpOnly dos JWTs (access/refresh).
 */
export function applySessionCookiesToResponse(
  res: NextResponse,
  session: SessionData,
  maxAgeSeconds = DEFAULT_DURATION_SECONDS
) {
  const sessionOpts = getSessionCookieOptions(maxAgeSeconds);
  const tokenOpts = getTokenCookieOptions(maxAgeSeconds);
  const clear = getClearTokenCookieOptions();

  res.cookies.set(AUTH_COOKIE_NAME, createSessionToken(session, maxAgeSeconds), sessionOpts);

  if (session.accessToken) {
    res.cookies.set(AUTH_ACCESS_COOKIE_NAME, session.accessToken, tokenOpts);
  } else {
    res.cookies.set(AUTH_ACCESS_COOKIE_NAME, "", clear);
  }

  if (session.refreshToken) {
    res.cookies.set(AUTH_REFRESH_COOKIE_NAME, session.refreshToken, tokenOpts);
  } else {
    res.cookies.set(AUTH_REFRESH_COOKIE_NAME, "", clear);
  }
}

export function getSessionDataFromCookieValue(
  tokenValue: string | undefined | null,
  accessTokenCookie?: string | null,
  refreshTokenCookie?: string | null
): SessionData | null {
  if (!tokenValue) return null;

  const [body, signature] = tokenValue.split(".");
  if (!body || !signature) return null;

  const expected = signTokenBody(body);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== providedBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return null;

  try {
    const decoded = decodeBase64Url(body);
    const payload = JSON.parse(decoded) as SessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!payload.id || !payload.name || !payload.email || !payload.type) return null;

    const accessFromSeparate =
      typeof accessTokenCookie === "string" && accessTokenCookie.length > 0
        ? accessTokenCookie
        : undefined;
    const refreshFromSeparate =
      typeof refreshTokenCookie === "string" && refreshTokenCookie.length > 0
        ? refreshTokenCookie
        : undefined;

    const accessToken = accessFromSeparate ?? payload.accessToken;
    const refreshToken = refreshFromSeparate ?? payload.refreshToken;

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      type: payload.type,
      ...(accessToken ? { accessToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
    };
  } catch {
    return null;
  }
}

export function getSessionUserFromCookieValue(
  tokenValue: string | undefined | null,
  accessTokenCookie?: string | null,
  refreshTokenCookie?: string | null
): SessionUser | null {
  const session = getSessionDataFromCookieValue(tokenValue, accessTokenCookie, refreshTokenCookie);
  if (!session) return null;

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    type: session.type,
  };
}

export function getSessionUserFromRequest(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session) return null;

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    type: session.type,
  };
}

/**
 * Mescla tokens repassados pelo middleware (mesma requisição) com o cookie bruto.
 * O Set-Cookie da renovação só vale na próxima ida ao browser; o SSR precisa dos headers internos.
 */
export function mergeMiddlewareSessionTokens(
  headersList: { get(name: string): string | null | undefined },
  cookieValue: string | undefined | null,
  accessTokenCookie?: string | null,
  refreshTokenCookie?: string | null
): SessionData | null {
  const cookieSession = getSessionDataFromCookieValue(
    cookieValue,
    accessTokenCookie,
    refreshTokenCookie
  );
  const mwAccess = headersList.get(MW_ACCESS_TOKEN_HEADER);
  const mwRefresh = headersList.get(MW_REFRESH_TOKEN_HEADER);
  if (mwAccess && cookieSession) {
    return {
      ...cookieSession,
      accessToken: mwAccess,
      refreshToken: mwRefresh || cookieSession.refreshToken,
    };
  }
  return cookieSession;
}

export function getSessionDataFromRequest(request: NextRequest) {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const at = request.cookies.get(AUTH_ACCESS_COOKIE_NAME)?.value;
  const rt = request.cookies.get(AUTH_REFRESH_COOKIE_NAME)?.value;
  return mergeMiddlewareSessionTokens(request.headers, cookie, at, rt);
}

/** Server Components: ler `cnc_session` + cookies de token (mesma lógica que `getSessionDataFromRequest`). */
export function getSessionDataFromCookieStore(
  cookieStore: { get(name: string): { value: string } | undefined },
  headersList: { get(name: string): string | null | undefined }
) {
  return mergeMiddlewareSessionTokens(
    headersList,
    cookieStore.get(AUTH_COOKIE_NAME)?.value,
    cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value,
    cookieStore.get(AUTH_REFRESH_COOKIE_NAME)?.value
  );
}

export function getSessionCookieOptions(maxAgeSeconds = DEFAULT_DURATION_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Remove o cookie de sessão (mesmo path/flags que `getSessionCookieOptions`, maxAge 0).
 * Usar em logout e quando o refresh token falha para não manter sessão morta no navegador.
 */
export function getClearSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

/**
 * 401 com limpeza do cookie `cnc_session` quando ainda há valor no request,
 * para não deixar o browser preso a sessão inválida/expirada (comportamento típico em aba normal vs anônima).
 */
export function applyUnauthorizedWithSessionCleanup(
  request: NextRequest,
  body: Record<string, unknown> = { error: "Nao autenticado" }
) {
  const res = NextResponse.json(body, { status: 401 });
  const clear = getClearSessionCookieOptions();
  if (request.cookies.get(AUTH_COOKIE_NAME)?.value) {
    res.cookies.set(AUTH_COOKIE_NAME, "", clear);
  }
  if (request.cookies.get(AUTH_ACCESS_COOKIE_NAME)?.value) {
    res.cookies.set(AUTH_ACCESS_COOKIE_NAME, "", clear);
  }
  if (request.cookies.get(AUTH_REFRESH_COOKIE_NAME)?.value) {
    res.cookies.set(AUTH_REFRESH_COOKIE_NAME, "", clear);
  }
  return res;
}

export function applyPrivateNoStoreHeaders(res: NextResponse) {
  res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  return res;
}
