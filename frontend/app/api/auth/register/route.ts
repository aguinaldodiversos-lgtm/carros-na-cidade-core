import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { registerUser } from "@/services/authService";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
} from "@/services/sessionService";

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

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload;

    const name = normalizeString(body.name);
    const email = normalizeString(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const phone = normalizeString(body.phone);
    const city = normalizeString(body.city);
    const documentNumber = normalizeString(body.document_number);
    const next = normalizeString(body.next);

    const documentType =
      body.document_type === "cpf" || body.document_type === "cnpj"
        ? body.document_type
        : undefined;

    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha sao obrigatorios" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Senha deve ter no minimo 6 caracteres" }, { status: 400 });
    }

    if ((documentType && !documentNumber) || (!documentType && documentNumber)) {
      return NextResponse.json(
        { error: "Informe tipo e numero do documento juntos." },
        { status: 400 }
      );
    }

    const registerPayload = {
      ...(name ? { name } : {}),
      email,
      password,
      ...(phone ? { phone } : {}),
      ...(city ? { city } : {}),
      ...(documentType ? { document_type: documentType } : {}),
      ...(documentNumber ? { document_number: documentNumber } : {}),
    };

    const result = await registerUser(registerPayload);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Nao foi possivel criar a conta." },
        { status: 400 }
      );
    }

    const { session: authSession } = result;

    const ru = authSession.user;
    if (
      !ru?.id ||
      !ru.email ||
      typeof ru.type !== "string" ||
      !ru.type.trim() ||
      !authSession.accessToken ||
      !authSession.refreshToken
    ) {
      return NextResponse.json({ error: "Resposta de autenticacao invalida." }, { status: 500 });
    }

    const sessionToken = createSessionToken({
      id: ru.id,
      name: ru.name,
      email: ru.email,
      type: ru.type,
      accessToken: authSession.accessToken,
      refreshToken: authSession.refreshToken,
    });

    const response = NextResponse.json({
      user: authSession.user,
      redirect_to: resolvePostLoginRedirect(authSession.user.type, next || undefined),
    });

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, getSessionCookieOptions());

    return response;
  } catch (error) {
    console.error("POST /api/auth/register error:", error);

    return NextResponse.json({ error: "Erro interno ao processar o cadastro." }, { status: 500 });
  }
}
