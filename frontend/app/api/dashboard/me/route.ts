import { NextRequest, NextResponse } from "next/server";
import { fetchDashboard } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  AUTH_COOKIE_NAME,
  getSessionDataFromRequest,
  getSessionCookieOptions,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const payload = await fetchDashboard(ensured.session);
    const res = NextResponse.json(payload);
    if (ensured.newCookie) {
      res.cookies.set(AUTH_COOKIE_NAME, ensured.newCookie, getSessionCookieOptions());
    }
    return res;
  } catch {
    return NextResponse.json({ error: "Falha ao carregar dashboard" }, { status: 502 });
  }
}
