import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSessionDataFromCookieValue,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

type BackendRefreshResponse = {
  accessToken?: string;
  access_token?: string;
  token?: string;
  refreshToken?: string;
  refresh_token?: string;
  user?: {
    id?: string | number;
    name?: string;
    email?: string;
    document_type?: string;
    type?: string;
  };
  error?: string;
  message?: string;
};

function extractToken(payload: BackendRefreshResponse, keys: (keyof BackendRefreshResponse)[]) {
  for (const key of keys) {
    const val = payload[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

/**
 * POST /api/auth/refresh
 *
 * Recebe o refreshToken do cliente, envia ao backend para renovar o accessToken,
 * e re-emite o cookie de sessão com o novo accessToken.
 *
 * Body: { refreshToken: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { refreshToken?: string };
    const refreshToken =
      typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";

    // Lê a sessão atual do cookie para preservar os dados do usuário
    const currentSession = getSessionDataFromCookieValue(
      request.cookies.get(AUTH_COOKIE_NAME)?.value
    );

    if (!refreshToken) {
      return NextResponse.json(
        { error: "refreshToken obrigatorio" },
        { status: 400 }
      );
    }

    const backendBase =
      process.env.API_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_URL?.trim() ||
      "";

    if (!backendBase) {
      return NextResponse.json(
        { error: "API backend nao configurada" },
        { status: 500 }
      );
    }

    const endpoint = `${backendBase.replace(/\/+$/, "")}/api/auth/refresh`;

    const backendResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });

    const data = (await backendResponse.json().catch(() => ({}))) as BackendRefreshResponse;

    if (!backendResponse.ok) {
      return NextResponse.json(
        { error: data.error || data.message || "Falha ao renovar token" },
        { status: backendResponse.status }
      );
    }

    const newAccessToken = extractToken(data, ["accessToken", "access_token", "token"]);
    const newRefreshToken = extractToken(data, ["refreshToken", "refresh_token"]);

    if (!newAccessToken) {
      return NextResponse.json(
        { error: "Backend nao retornou accessToken" },
        { status: 502 }
      );
    }

    // Se não temos sessão atual no cookie, não podemos re-emiti-la
    if (!currentSession) {
      return NextResponse.json(
        { error: "Sessao invalida. Faca login novamente." },
        { status: 401 }
      );
    }

    // Re-emite o cookie de sessão com os novos tokens
    const updatedSessionToken = createSessionToken({
      id: currentSession.id,
      name: currentSession.name,
      email: currentSession.email,
      type: currentSession.type,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken ?? currentSession.refreshToken,
    });

    const response = NextResponse.json({ ok: true, accessToken: newAccessToken });

    response.cookies.set(AUTH_COOKIE_NAME, updatedSessionToken, getSessionCookieOptions());

    return response;
  } catch (error) {
    console.error("[POST /api/auth/refresh] Erro:", error);
    return NextResponse.json(
      { error: "Erro interno ao renovar token" },
      { status: 500 }
    );
  }
}
