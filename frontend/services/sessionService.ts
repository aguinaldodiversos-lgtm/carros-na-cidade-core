import crypto from "crypto";
import type { NextRequest } from "next/server";
import type { AccountType } from "@/lib/dashboard-types";

export const AUTH_COOKIE_NAME = "cnc_session";

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

type SessionPayload = SessionData & {
  iat: number;
  exp: number;
};

const DEFAULT_DURATION_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET ?? "cnc-dev-session-secret";
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

export function createSessionToken(user: SessionData, maxAgeSeconds = DEFAULT_DURATION_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...user,
    iat: now,
    exp: now + maxAgeSeconds,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signTokenBody(body);
  return `${body}.${signature}`;
}

export function getSessionDataFromCookieValue(tokenValue: string | undefined | null): SessionData | null {
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

    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      type: payload.type,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
    };
  } catch {
    return null;
  }
}

export function getSessionUserFromCookieValue(tokenValue: string | undefined | null): SessionUser | null {
  const session = getSessionDataFromCookieValue(tokenValue);
  if (!session) return null;

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    type: session.type,
  };
}

export function getSessionUserFromRequest(request: NextRequest) {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return getSessionUserFromCookieValue(cookie);
}

export function getSessionDataFromRequest(request: NextRequest) {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return getSessionDataFromCookieValue(cookie);
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
