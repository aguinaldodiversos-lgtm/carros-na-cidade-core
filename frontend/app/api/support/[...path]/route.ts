import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

/**
 * BFF do usuário logado para os chamados de suporte. Espelha o proxy admin
 * (app/api/admin/[...path]), mas valida a SESSÃO DE USUÁRIO (não admin) e
 * encaminha para /api/support/* no backend com o Bearer do próprio usuário.
 * A posse de cada chamado é reforçada no backend (user_id === req.user.id).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 20_000;

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

function isSafePathSegment(segment: string): boolean {
  if (!segment) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  // 1) sessão de usuário --------------------------------------------------
  const session = getSessionDataFromRequest(request);
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return deny(401, "Não autenticado");
  }
  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok || !ensured.session.accessToken) {
    return deny(401, "Sessão inválida. Entre novamente.");
  }
  const persistCookies = ensured.persistCookies ?? null;

  // 2) path seguro --------------------------------------------------------
  const segments = Array.isArray(params.path) ? params.path : [];
  if (!segments.length || !segments.every(isSafePathSegment)) {
    return deny(400, "Caminho inválido");
  }
  const subPath = segments.join("/");
  const search = request.nextUrl.search || "";
  const backendUrl = resolveInternalBackendApiUrl(`/api/support/${subPath}${search}`);
  if (!backendUrl) {
    return deny(502, "Backend não configurado");
  }

  // 3) headers controlados ------------------------------------------------
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ensured.session.accessToken}`,
    Accept: "application/json",
    ...buildBffBackendForwardHeaders(request),
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  // 4) body só em métodos com payload ------------------------------------
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      return deny(400, "Body inválido");
    }
  }

  // 5) chamada com timeout ------------------------------------------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : { ok: upstream.ok };
    } catch {
      data = { ok: false, error: "Resposta inválida do backend" };
    }

    const response = NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "private, no-store" },
    });
    if (persistCookies) {
      applySessionCookiesToResponse(response, persistCookies);
    }
    return response;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return deny(504, "Timeout ao consultar o backend");
    }
    return deny(503, "Erro de comunicação com o backend");
  } finally {
    clearTimeout(timer);
  }
}

export const GET = proxy;
export const POST = proxy;
