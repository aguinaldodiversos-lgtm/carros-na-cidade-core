import { NextRequest, NextResponse } from "next/server";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import type { AccountType } from "@/lib/dashboard-types";
import {
  AUTH_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

function parseBackendUserType(value: unknown): AccountType {
  if (value === "CNPJ" || value === "CPF" || value === "pending") return value;
  const s = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (s === "CNPJ") return "CNPJ";
  if (s === "PENDING") return "pending";
  return "CPF";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const url = resolveBackendApiUrl("/api/auth/verify-document");
    if (!url) {
      return NextResponse.json({ error: "Backend nao configurado." }, { status: 500 });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${ensured.session.accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const parsed = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      success?: boolean;
    };

    if (!res.ok) {
      const msg =
        typeof parsed?.message === "string"
          ? parsed.message
          : typeof parsed?.error === "string"
            ? parsed.error
            : "Falha na verificacao do documento.";
      return NextResponse.json({ error: msg }, { status: res.status >= 400 ? res.status : 400 });
    }

    const meUrl = resolveBackendApiUrl("/api/auth/me");
    if (!meUrl) {
      const out = NextResponse.json(parsed);
      if (ensured.newCookie) {
        out.cookies.set(AUTH_COOKIE_NAME, ensured.newCookie, getSessionCookieOptions());
      }
      return out;
    }

    const meRes = await fetch(meUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${ensured.session.accessToken}`,
      },
      cache: "no-store",
    });

    const meJson = (await meRes.json().catch(() => null)) as {
      user?: { id?: string; name?: string; email?: string; type?: string };
    } | null;

    const u = meJson?.user;
    if (u?.id) {
      const nextSession = {
        ...ensured.session,
        id: String(u.id),
        name: typeof u.name === "string" && u.name.trim() ? u.name.trim() : ensured.session.name,
        email: typeof u.email === "string" && u.email.trim() ? u.email.trim() : ensured.session.email,
        type: parseBackendUserType(u.type),
        accessToken: ensured.session.accessToken,
        refreshToken: ensured.session.refreshToken,
      };
      const token = createSessionToken(nextSession);
      const response = NextResponse.json({ success: true, user: u, ...parsed });
      response.cookies.set(AUTH_COOKIE_NAME, token, getSessionCookieOptions());
      return response;
    }

    const out = NextResponse.json({ success: true, ...parsed });
    if (ensured.newCookie) {
      out.cookies.set(AUTH_COOKIE_NAME, ensured.newCookie, getSessionCookieOptions());
    }
    return out;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao verificar documento." },
      { status: 500 }
    );
  }
}
