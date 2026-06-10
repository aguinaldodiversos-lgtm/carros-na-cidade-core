import { NextRequest, NextResponse } from "next/server";
import {
  getSessionDataFromRequest,
  applySessionCookiesToResponse,
} from "@/services/sessionService";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { assertAdminSession } from "@/lib/admin/server-admin-session";
import { triggerBlogRevalidate } from "@/lib/admin/blog-revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BFF de transições de status do post (Fase 4.2):
 *   PATCH /api/admin/blog/posts/:id/(publish|unpublish|archive|restore)
 *
 * Toda transição aceita muda a visibilidade pública do post → dispara
 * revalidate de /blog + tag public-blog (best-effort, não bloqueia).
 * Reason obrigatório é validado no backend; aqui só proxy + cache.
 *
 * Nota: cover-image tem rota própria (multipart precisa de arrayBuffer,
 * não text()).
 */

const PROXY_TIMEOUT_MS = 20_000;
const ID_RE = /^\d+$/;
const VALID_ACTIONS = new Set(["publish", "unpublish", "archive", "restore"]);

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, success: false, error, message: error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

function normalizeUpstreamPayload(
  upstreamOk: boolean,
  upstreamStatus: number,
  payload: unknown
): unknown {
  if (upstreamOk) return payload;
  const out: Record<string, unknown> = {
    ok: false,
    success: false,
    status: upstreamStatus,
  };
  if (payload && typeof payload === "object") {
    const src = payload as Record<string, unknown>;
    const msg =
      typeof src.message === "string" && src.message.trim()
        ? src.message
        : typeof src.error === "string" && src.error.trim()
          ? src.error
          : `Erro ${upstreamStatus}`;
    out.message = msg;
    out.error = msg;
    for (const k of ["requestId", "details", "code"]) {
      if (k in src) out[k] = src[k];
    }
  } else {
    out.message = `Erro ${upstreamStatus}`;
    out.error = `Erro ${upstreamStatus}`;
  }
  return out;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  const session = getSessionDataFromRequest(request);
  const assertion = await assertAdminSession(session);
  if (!assertion.ok) {
    if (assertion.reason === "unauthenticated") return deny(401, "Não autenticado");
    if (assertion.reason === "forbidden") return deny(403, "Acesso restrito ao painel admin");
    return deny(503, "Backend indisponível para validar sessão");
  }

  const id = String(params?.id || "").trim();
  if (!ID_RE.test(id)) return deny(400, "id inválido");

  const action = String(params?.action || "").trim();
  if (!VALID_ACTIONS.has(action)) return deny(404, "Ação desconhecida");

  const { session: ensured } = assertion;
  const persistCookies =
    ensured.accessToken !== session?.accessToken || ensured.refreshToken !== session?.refreshToken
      ? ensured
      : null;

  const backendUrl = resolveInternalBackendApiUrl(`/api/admin/blog/posts/${id}/${action}`);
  if (!backendUrl) return deny(502, "Backend não configurado");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ensured.accessToken}`,
    Accept: "application/json",
    ...buildBffBackendForwardHeaders(request),
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: string | undefined;
  try {
    body = await request.text();
  } catch {
    return deny(400, "Body inválido");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const upstream = await fetch(backendUrl, {
      method: "PATCH",
      headers,
      body,
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await upstream.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : { ok: upstream.ok };
    } catch {
      parsed = { ok: false, message: "Resposta inválida do backend" };
    }
    const data = normalizeUpstreamPayload(upstream.ok, upstream.status, parsed);

    const response = NextResponse.json(data, {
      status: upstream.status,
      headers: { "Cache-Control": "private, no-store" },
    });
    if (persistCookies) applySessionCookiesToResponse(response, persistCookies);

    if (upstream.ok) {
      try {
        await triggerBlogRevalidate();
      } catch (err) {
        console.warn("[admin/blog/posts/:id/:action] revalidate falhou", {
          id,
          action,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return response;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return deny(504, "Timeout ao consultar o backend");
    return deny(503, "Erro de comunicação com o backend");
  } finally {
    clearTimeout(timer);
  }
}
