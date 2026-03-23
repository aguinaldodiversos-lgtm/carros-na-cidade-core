import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { authenticateUser } from "@/services/authService";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  email?: string;
  password?: string;
  next?: string;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload;

    const email = normalizeString(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const next = normalizeString(body.next);

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email e senha sao obrigatorios" },
        { status: 400 }
      );
    }

    const authSession = await authenticateUser(email, password);

    if (!authSession) {
      return NextResponse.json(
        { error: "Credenciais invalidas" },
        { status: 401 }
      );
    }

    if (
      !authSession.user ||
      !authSession.user.id ||
      !authSession.user.email ||
      !authSession.user.type
    ) {
      return NextResponse.json(
        { error: "Resposta de autenticacao invalida." },
        { status: 500 }
      );
    }

    const sessionToken = createSessionToken({
      id: authSession.user.id,
      name: authSession.user.name,
      email: authSession.user.email,
      type: authSession.user.type,
      accessToken: authSession.accessToken,
      refreshToken: authSession.refreshToken,
    });

    const redirectTo = authSession.accessToken
      ? resolvePostLoginRedirect(authSession.user.type, next || undefined)
      : "/login";

    const response = NextResponse.json({
      user: authSession.user,
      redirect_to: redirectTo,
    });

    response.cookies.set(
      AUTH_COOKIE_NAME,
      sessionToken,
      getSessionCookieOptions()
    );

    return response;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);

    return NextResponse.json(
      { error: "Erro interno ao processar o login." },
      { status: 500 }
    );
  }
}
