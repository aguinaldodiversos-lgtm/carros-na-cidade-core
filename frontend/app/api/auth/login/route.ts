import { NextRequest, NextResponse } from "next/server";
import { resolvePostLoginRedirect } from "@/lib/auth/redirects";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { authenticateUser, BackendAuthError } from "@/services/authService";
import {
  applyPrivateNoStoreHeaders,
  applySessionCookiesToResponse,
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

function safeBackendAuthMessage(message: string, fallback: string) {
  const normalized = normalizeString(message);
  if (!normalized || normalized.length > 180) return fallback;

  if (
    /password_hash|jwt_secret|database|postgres|select\s|insert\s|update\s|stack|trace/i.test(
      normalized
    )
  ) {
    return fallback;
  }

  return normalized;
}

function responseFromBackendAuthError(error: BackendAuthError) {
  const status = error.status;

  if (status === 401) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
  }

  if (status === 403) {
    return NextResponse.json(
      { error: safeBackendAuthMessage(error.message, "Acesso negado.") },
      { status: 403 }
    );
  }

  if (status === 429) {
    return NextResponse.json(
      {
        error: safeBackendAuthMessage(
          error.message,
          "Muitas tentativas. Tente novamente mais tarde."
        ),
      },
      { status: 429 }
    );
  }

  if (status >= 400 && status < 500) {
    return NextResponse.json(
      { error: safeBackendAuthMessage(error.message, "Nao foi possivel autenticar.") },
      { status }
    );
  }

  return NextResponse.json(
    { error: "Servico de autenticacao indisponivel. Tente novamente em instantes." },
    { status: 502 }
  );
}

function isConnectionError(error: unknown) {
  return (
    error instanceof Error &&
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network|socket|EAI_AGAIN/i.test(error.message)
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload;

    const email = normalizeString(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const next = normalizeString(body.next);

    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha sao obrigatorios" }, { status: 400 });
    }

    const forwardHeaders = buildBffBackendForwardHeaders(request);
    const authSession = await authenticateUser(email, password, forwardHeaders);

    if (!authSession) {
      return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
    }

    const u = authSession.user;
    if (!u?.id || !u.email || typeof u.type !== "string" || !u.type.trim()) {
      return NextResponse.json({ error: "Resposta de autenticacao invalida." }, { status: 500 });
    }

    const redirectTo = authSession.accessToken
      ? resolvePostLoginRedirect(authSession.user.type, next || undefined)
      : "/login";

    const response = NextResponse.json({
      user: authSession.user,
      redirect_to: redirectTo,
    });

    applySessionCookiesToResponse(response, {
      id: authSession.user.id,
      name: authSession.user.name,
      email: authSession.user.email,
      type: authSession.user.type,
      accessToken: authSession.accessToken,
      refreshToken: authSession.refreshToken,
    });
    applyPrivateNoStoreHeaders(response);

    return response;
  } catch (error) {
    console.error("POST /api/auth/login error:", error);

    if (error instanceof BackendAuthError) {
      return responseFromBackendAuthError(error);
    }

    if (
      error instanceof Error &&
      /credenciais invalidas|credenciais inválidas|nao foi possivel autenticar/i.test(error.message)
    ) {
      return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
    }

    if (isConnectionError(error)) {
      return NextResponse.json(
        { error: "Servidor indisponivel. Verifique se o backend esta ativo." },
        { status: 502 }
      );
    }

    return NextResponse.json({ error: "Erro interno ao processar o login." }, { status: 500 });
  }
}
