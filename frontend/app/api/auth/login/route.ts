import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/services/authService";
import { AUTH_COOKIE_NAME, createSessionToken, getSessionCookieOptions } from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  email?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha sao obrigatorios" }, { status: 400 });
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
  }

  const sessionToken = createSessionToken({
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
  });

  const response = NextResponse.json({
    user,
    redirect_to: "/dashboard",
  });

  response.cookies.set(AUTH_COOKIE_NAME, sessionToken, getSessionCookieOptions());
  return response;
}
