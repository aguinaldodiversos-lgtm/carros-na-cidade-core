import { NextRequest, NextResponse } from "next/server";
import { fetchDashboard } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  AUTH_COOKIE_NAME,
  applyPrivateNoStoreHeaders,
  applyUnauthorizedWithSessionCleanup,
  getSessionDataFromRequest,
  getSessionCookieOptions,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return applyPrivateNoStoreHeaders(applyUnauthorizedWithSessionCleanup(request));
  }

  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok) {
    return applyPrivateNoStoreHeaders(applyUnauthorizedWithSessionCleanup(request));
  }

  try {
    const payload = await fetchDashboard(ensured.session);
    const res = NextResponse.json(payload);
    applyPrivateNoStoreHeaders(res);
    if (ensured.newCookie) {
      res.cookies.set(AUTH_COOKIE_NAME, ensured.newCookie, getSessionCookieOptions());
    }
    return res;
  } catch (error) {
    if (process.env.DASHBOARD_DEBUG === "1") {
      console.error("[GET /api/dashboard/me]", error);
    }
    return applyPrivateNoStoreHeaders(
      NextResponse.json({ error: "Falha ao carregar dashboard" }, { status: 502 })
    );
  }
}
