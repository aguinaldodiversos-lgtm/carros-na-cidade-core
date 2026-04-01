import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/services/sessionService";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout
 *
 * Invalida a sessão do frontend zerando o cookie cnc_session.
 * O refreshToken do backend deve ser revogado pelo cliente antes de chamar este endpoint,
 * ou pelo backend via POST /api/auth/logout com o refreshToken no body.
 */
export async function POST(request: NextRequest) {
  // Tenta propagar o logout para o backend (revogar refresh token)
  try {
    const body = await request.json().catch(() => ({})) as { refreshToken?: string };
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : null;

    const backendUrl = process.env.API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || "";

    if (backendUrl && refreshToken) {
      await fetch(`${backendUrl.replace(/\/+$/, "")}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      }).catch(() => {
        // falha silenciosa: mesmo sem revogar no backend, o cookie será removido
      });
    }
  } catch {
    // falha silenciosa: sempre prosseguir para limpar o cookie
  }

  const response = NextResponse.json({ ok: true });

  // Zera o cookie de sessão do BFF
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
