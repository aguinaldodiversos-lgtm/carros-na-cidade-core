import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { registerUser } from "@/services/authService";
import { AUTH_COOKIE_NAME, createSessionToken, getSessionCookieOptions } from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  city?: string;
  document_type?: "cpf" | "cnpj";
  document_number?: string;
  next?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha sao obrigatorios" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Senha deve ter no minimo 6 caracteres" }, { status: 400 });
  }

  const result = await registerUser({
    name: name || undefined,
    email,
    password,
    phone: body.phone || undefined,
    city: body.city || undefined,
    document_type: body.document_type,
    document_number: body.document_number || undefined,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Nao foi possivel criar a conta." },
      { status: 400 }
    );
  }

  const { session: authSession } = result;
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
