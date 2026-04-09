import { NextRequest, NextResponse } from "next/server";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
  applyPrivateNoStoreHeaders,
  getClearSessionCookieOptions,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  const backendUrl = resolveBackendApiUrl("/api/auth/logout");
  if (backendUrl && session?.refreshToken) {
    await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    }).catch(() => {});
  }

  const clear = getClearSessionCookieOptions();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", clear);
  res.cookies.set(AUTH_ACCESS_COOKIE_NAME, "", clear);
  res.cookies.set(AUTH_REFRESH_COOKIE_NAME, "", clear);
  applyPrivateNoStoreHeaders(res);
  return res;
}
