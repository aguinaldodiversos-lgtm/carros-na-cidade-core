import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

/**
 * BFF das notificações internas do usuário logado.
 *
 * Espelha `app/api/support/[...path]` — valida a SESSÃO e encaminha para
 * `/api/account/notifications/*` no backend com o Bearer do próprio usuário. A
 * posse de cada notificação é reforçada lá (WHERE recipient_user_id), então
 * este proxy nunca precisa saber de quem é o quê.
 *
 * Catch-all OPCIONAL (`[[...path]]`) e não `[...path]` como o de suporte: aqui
 * a rota base sem segmento nenhum é um endpoint real (a listagem). Com o
 * catch-all obrigatório, `GET /api/account/notifications` não casaria.
 *
 * Só GET e PATCH são expostos — o backend não tem criação por HTTP, e não faz
 * sentido este proxy oferecer verbos que o destino recusa.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 15_000;

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Segmento de caminho seguro. Sem `.`/`..` (traversal), sem barra e sem
 * control-char — o valor é concatenado na URL do backend.
 */
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

async function proxy(request: NextRequest, { params }: { params: { path?: string[] } }) {
  // 1) sessão ------------------------------------------------------------
  const session = getSessionDataFromRequest(request);
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return deny(401, "Não autenticado");
  }
  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok || !ensured.session.accessToken) {
    return deny(401, "Sessão inválida. Entre novamente.");
  }
  const persistCookies = ensured.persistCookies ?? null;

  // 2) caminho seguro ----------------------------------------------------
  const segments = Array.isArray(params.path) ? params.path : [];
  if (segments.length && !segments.every(isSafePathSegment)) {
    return deny(400, "Caminho inválido");
  }
  const subPath = segments.length ? `/${segments.join("/")}` : "";
  const search = request.nextUrl.search || "";
  const backendUrl = resolveInternalBackendApiUrl(`/api/account/notifications${subPath}${search}`);
  if (!backendUrl) {
    return deny(502, "Backend não configurado");
  }

  // 3) headers controlados ----------------------------------------------
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ensured.session.accessToken}`,
    Accept: "application/json",
    ...buildBffBackendForwardHeaders(request),
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  // 4) body só nos métodos que têm payload -------------------------------
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      return deny(400, "Body inválido");
    }
  }

  // 5) encaminha ---------------------------------------------------------
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await upstream.json().catch(() => null);

    const response = NextResponse.json(payload ?? {}, {
      status: upstream.status,
      // Nunca cacheável: é a caixa postal de UMA pessoa.
      headers: { "Cache-Control": "private, no-store" },
    });

    if (persistCookies) {
      applySessionCookiesToResponse(response, persistCookies);
    }

    return response;
  } catch (error) {
    // O sino não pode derrubar o painel: falha vira 502 previsível e o
    // componente degrada sozinho.
    const aborted = error instanceof Error && error.name === "AbortError";
    return deny(
      502,
      aborted ? "Tempo esgotado ao carregar notificações." : "Falha ao falar com o servidor."
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}
