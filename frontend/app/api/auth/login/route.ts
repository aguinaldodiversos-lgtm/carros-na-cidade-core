import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { authenticateUser } from "@/services/authService";
import { AUTH_COOKIE_NAME, createSessionToken, getSessionCookieOptions } from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  email?: string;
  password?: string;
  next?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha sao obrigatorios" }, { status: 400 });
  }

  const authSession = await authenticateUser(email, password);
  if (!authSession) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
  }

  const sessionToken = createSessionToken({
    id: authSession.user.id,
    name: authSession.user.name,
    email: authSession.user.email,
    type: authSession.user.type,
    accessToken: authSession.accessToken,
    refreshToken: authSession.refreshToken,
  });

  const response = NextResponse.json({
    user: authSession.user,
    redirect_to: resolvePostLoginRedirect(authSession.user.type, body.next),
  });

  response.cookies.set(AUTH_COOKIE_NAME, sessionToken, getSessionCookieOptions());
  return response;
}
