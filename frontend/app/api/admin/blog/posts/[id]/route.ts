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
 * BFF dedicado por post do blog (Fase 4.2).
 *
 * - GET: detalhe completo do post.
 * - PATCH: edita campos + dispara revalidate do blog público (best-effort).
 *   O PATCH pode alterar um post PUBLISHED (título, conteúdo, SEO…), então
 *   o cache público precisa ser invalidado — mesmo racional do BFF de
 *   banners da Home. Lista (GET /blog/posts) e criação (POST) seguem no
 *   proxy genérico [...path] — criar draft não muda nada público.
 */

const PROXY_TIMEOUT_MS = 20_000;
const ID_RE = /^\d+$/;

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, success: false, error, message: error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Erros do backend chegam com `error: true` (boolean). Reescrevemos para
 * `message`/`error` string — qualquer consumidor lê mensagem confiável.
 */
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

async function proxy(request: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionDataFromRequest(request);
  const assertion = await assertAdminSession(session);
  if (!assertion.ok) {
    if (assertion.reason === "unauthenticated") return deny(401, "Não autenticado");
    if (assertion.reason === "forbidden") return deny(403, "Acesso restrito ao painel admin");
    return deny(503, "Backend indisponível para validar sessão");
  }

  const id = String(params?.id || "").trim();
  if (!ID_RE.test(id)) {
    return deny(400, "id inválido");
  }

  const { session: ensured } = assertion;
  const persistCookies =
    ensured.accessToken !== session?.accessToken || ensured.refreshToken !== session?.refreshToken
      ? ensured
      : null;

  const search = request.nextUrl.search || "";
  const backendUrl = resolveInternalBackendApiUrl(`/api/admin/blog/posts/${id}${search}`);
  if (!backendUrl) return deny(502, "Backend não configurado");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ensured.accessToken}`,
    Accept: "application/json",
    ...buildBffBackendForwardHeaders(request),
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {
      return deny(400, "Body inválido");
    }
  }

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

    // PATCH aceito pode ter alterado um post no ar — invalida o blog
    // público. Best-effort: falha de revalidate não desfaz o save.
    if (request.method === "PATCH" && upstream.ok) {
      try {
        await triggerBlogRevalidate();
      } catch (err) {
        console.warn("[admin/blog/posts/:id] revalidate falhou", {
          id,
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

export const GET = proxy;
export const PATCH = proxy;
