import { NextRequest, NextResponse } from "next/server";
import { getSessionDataFromRequest, applySessionCookiesToResponse } from "@/services/sessionService";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { assertAdminSession } from "@/lib/admin/server-admin-session";
import { triggerHomeHeroRevalidate } from "@/lib/admin/home-revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BFF dedicado por banner (Fase 4.1.1).
 *
 * - GET: detalhe de um banner.
 * - PATCH: atualiza apenas aquele banner + dispara revalidate do cache
 *   público (best-effort; falha não bloqueia o PATCH).
 *
 * Por que rota dinâmica em vez de [...path] genérico?
 *   Para anexar a chamada de revalidate APÓS um PATCH bem-sucedido sem
 *   poluir o proxy genérico com semântica específica de home.
 */

const PROXY_TIMEOUT_MS = 20_000;
const VALID_POSITIONS = new Set(["1", "2", "3"]);

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, success: false, error, message: error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Garante um shape previsível para o client:
 *   - sucesso: mantém o payload do backend intacto (já é { ok, data }).
 *   - erro:    força `{ ok:false, success:false, message:<string humana>, status }`.
 *     O backend retorna `error: true` (boolean — flag, não texto), o que
 *     fazia o adminFetch antigo renderizar "true" no modal. Aqui
 *     reescrevemos para que QUALQUER consumidor leia `message` confiável.
 *     Campos originais do backend (requestId, details) são preservados.
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
    out.error = msg; // string — nunca boolean.
    for (const k of ["requestId", "details", "code"]) {
      if (k in src) out[k] = src[k];
    }
  } else {
    out.message = `Erro ${upstreamStatus}`;
    out.error = `Erro ${upstreamStatus}`;
  }
  return out;
}

async function proxy(request: NextRequest, { params }: { params: { position: string } }) {
  const session = getSessionDataFromRequest(request);
  const assertion = await assertAdminSession(session);
  if (!assertion.ok) {
    if (assertion.reason === "unauthenticated") return deny(401, "Não autenticado");
    if (assertion.reason === "forbidden") return deny(403, "Acesso restrito ao painel admin");
    return deny(503, "Backend indisponível para validar sessão");
  }

  const position = String(params?.position || "").trim();
  if (!VALID_POSITIONS.has(position)) {
    return deny(400, "position inválido");
  }

  const { session: ensured } = assertion;
  const persistCookies =
    ensured.accessToken !== session?.accessToken ||
    ensured.refreshToken !== session?.refreshToken
      ? ensured
      : null;

  const search = request.nextUrl.search || "";
  const backendUrl = resolveInternalBackendApiUrl(
    `/api/admin/home/hero/${position}${search}`
  );
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

    // PATCH bem-sucedido em QUALQUER banner invalida o cache da Home —
    // o público lista os 3 banners ativos do mesmo cache.
    if (request.method === "PATCH" && upstream.ok) {
      try {
        await triggerHomeHeroRevalidate();
      } catch (err) {
        console.warn("[admin/home/hero/:position] revalidate falhou", {
          position,
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
