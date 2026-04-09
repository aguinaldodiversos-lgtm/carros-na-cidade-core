import { accessTokenNeedsRefresh } from "@/lib/auth/jwt-access";
import { refreshBackendTokens } from "@/lib/auth/refresh-backend-tokens";
import type { SessionData } from "@/services/sessionService";

export type EnsureBackendSessionResult =
  | { ok: true; session: SessionData; persistCookies?: SessionData }
  | { ok: false; reason: "missing_session" | "cannot_refresh" };

/**
 * Garante access token utilizável para chamadas ao backend (Node / Route Handlers).
 * Usado quando o middleware não rodou ou como fallback após 401.
 */
export async function ensureSessionWithFreshBackendTokens(
  session: SessionData | null | undefined
): Promise<EnsureBackendSessionResult> {
  if (!session?.id) {
    return { ok: false, reason: "missing_session" };
  }

  if (!session.refreshToken && !session.accessToken) {
    return { ok: false, reason: "cannot_refresh" };
  }

  if (!accessTokenNeedsRefresh(session.accessToken)) {
    return { ok: true, session };
  }

  if (!session.refreshToken) {
    return { ok: false, reason: "cannot_refresh" };
  }

  const tokens = await refreshBackendTokens(session.refreshToken);
  if (!tokens) {
    return { ok: false, reason: "cannot_refresh" };
  }

  const next: SessionData = {
    id: session.id,
    name: session.name,
    email: session.email,
    type: session.type,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };

  return {
    ok: true,
    session: next,
    persistCookies: next,
  };
}
