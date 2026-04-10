/**
 * Shared BFF helpers for authenticated API route handlers.
 *
 * Encapsulates the common pattern: read session -> refresh tokens -> build headers.
 * Prevents the class of bugs where routes forget token refresh or IP forwarding.
 */
import { NextRequest, NextResponse } from "next/server";
import { ensureSessionWithFreshBackendTokens, type EnsureBackendSessionResult } from "@/lib/session/ensure-backend-session";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
  type SessionData,
} from "@/services/sessionService";

export type AuthenticatedBffContext = {
  session: SessionData;
  backendHeaders: Record<string, string>;
  persistCookies?: SessionData;
};

export type BffAuthResult =
  | { ok: true; ctx: AuthenticatedBffContext }
  | { ok: false; response: NextResponse };

/**
 * Validates session, refreshes tokens if needed, and builds backend headers.
 * Returns either an authenticated context or a 401 response ready to send.
 */
export async function authenticateBffRequest(request: NextRequest): Promise<BffAuthResult> {
  const session = getSessionDataFromRequest(request);
  const ensured = await ensureSessionWithFreshBackendTokens(session);

  if (!ensured.ok || !ensured.session.accessToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Nao autenticado" }, { status: 401 }),
    };
  }

  return {
    ok: true,
    ctx: {
      session: ensured.session,
      backendHeaders: {
        Authorization: `Bearer ${ensured.session.accessToken}`,
        Accept: "application/json",
        ...buildBffBackendForwardHeaders(request),
      },
      persistCookies: ensured.persistCookies,
    },
  };
}

/**
 * Applies refreshed session cookies to a response if tokens were rotated.
 */
export function applyBffCookies(
  response: NextResponse,
  ctx: Pick<AuthenticatedBffContext, "persistCookies">
): NextResponse {
  if (ctx.persistCookies) {
    applySessionCookiesToResponse(response, ctx.persistCookies);
  }
  return response;
}
