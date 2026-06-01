import { NextRequest, NextResponse } from "next/server";
import { getSessionDataFromRequest, applySessionCookiesToResponse } from "@/services/sessionService";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { assertAdminSession } from "@/lib/admin/server-admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BFF de upload por banner (Fase 4.1.1).
 *
 * Pass-through multipart para POST /api/admin/home/hero/:position/image.
 * Não dispara revalidate — upload sozinho não muda nada visível; a
 * imagem só vira o banner ativo quando o admin clica "Publicar" e o
 * PATCH em /api/admin/home/hero/:position é aceito.
 */

const PROXY_TIMEOUT_MS = 60_000;
const VALID_POSITIONS = new Set(["1", "2", "3"]);

function deny(status: number, error: string) {
  return NextResponse.json(
    { ok: false, success: false, error, message: error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Mesma normalização da rota /:position — força `message` string nos
 * erros para o client não renderizar `error: true` literal. Mantém
 * payload de sucesso intacto.
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

export async function POST(
  request: NextRequest,
  { params }: { params: { position: string } }
) {
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
    `/api/admin/home/hero/${position}/image${search}`
  );
  if (!backendUrl) return deny(502, "Backend não configurado");

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return deny(400, "Content-Type deve ser multipart/form-data");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ensured.accessToken}`,
    Accept: "application/json",
    "Content-Type": contentType,
    ...buildBffBackendForwardHeaders(request),
  };

  const body = await request.arrayBuffer();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: Buffer.from(body),
      cache: "no-store",
      signal: controller.signal,
      // @ts-expect-error — duplex é exigido pelo Node 20+ para POST com body, não tipado ainda.
      duplex: "half",
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
    return response;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return deny(504, "Timeout no upload");
    return deny(503, "Erro de comunicação com o backend");
  } finally {
    clearTimeout(timer);
  }
}
