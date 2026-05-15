import { NextRequest, NextResponse } from "next/server";
import { getSessionDataFromRequest } from "@/services/sessionService";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import { applySessionCookiesToResponse } from "@/services/sessionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const session = getSessionDataFromRequest(request);
  const ensured = await ensureSessionWithFreshBackendTokens(session);

  if (!ensured.ok || !ensured.session.accessToken) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const subPath = params.path.join("/");
  const search = request.nextUrl.search || "";
  const backendUrl = resolveInternalBackendApiUrl(`/api/admin/${subPath}${search}`);

  if (!backendUrl) {
    return NextResponse.json({ ok: false, error: "Backend não configurado" }, { status: 502 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ensured.session.accessToken}`,
    Accept: "application/json",
    ...buildBffBackendForwardHeaders(request),
  };

  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {}
  }

  try {
    const res = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Resposta inválida do backend" };
    }

    const response = NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "private, no-store" },
    });
    if (ensured.persistCookies) {
      applySessionCookiesToResponse(response, ensured.persistCookies);
    }
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Erro de comunicação com o backend" },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
