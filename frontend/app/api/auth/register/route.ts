import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { registerUser } from "@/services/authService";
import { applyPrivateNoStoreHeaders, applySessionCookiesToResponse } from "@/services/sessionService";

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

    const forwardHeaders = buildBffBackendForwardHeaders(request);
    const result = await registerUser(registerPayload, forwardHeaders);

    if (!result.success) {
      // Conta criada no backend mas sessão automática falhou: redirecionar para login.
      if (result.created) {
        const res = NextResponse.json({ redirect_to: "/login" });
        applyPrivateNoStoreHeaders(res);
        return res;
      }

      // Propagar o status real do backend (4xx) ou mapear 5xx para 502 (gateway).
      const backendStatus = result.status ?? 400;
      const httpStatus =
        backendStatus >= 500 && backendStatus <= 599
          ? 502
          : backendStatus >= 400 && backendStatus <= 499
            ? backendStatus
            : 400;

      return NextResponse.json(
        { error: result.error ?? "Nao foi possivel criar a conta." },
        { status: httpStatus }
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

    const response = NextResponse.json({
      user: authSession.user,
      redirect_to: resolvePostLoginRedirect(authSession.user.type, next || undefined),
    });

    try {
      applySessionCookiesToResponse(response, {
        id: ru.id,
        name: ru.name,
        email: ru.email,
        type: ru.type,
        accessToken: authSession.accessToken,
        refreshToken: authSession.refreshToken,
      });
      applyPrivateNoStoreHeaders(response);
    } catch (error) {
      console.error(
        "POST /api/auth/register session cookie error:",
        error instanceof Error ? error.message : error
      );
      const fallback = NextResponse.json({ redirect_to: "/login" });
      applyPrivateNoStoreHeaders(fallback);
      return fallback;
    }

    return response;
  } catch (error) {
    console.error("POST /api/auth/register error:", error);

    return NextResponse.json({ error: "Erro interno ao processar o cadastro." }, { status: 500 });
  }
}
