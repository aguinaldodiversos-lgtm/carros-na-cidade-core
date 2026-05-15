/**
 * BFF: GET /api/ads/:id/publication-options (Fase 4).
 *
 * Proxy autenticado pra rota dedicada do backend
 * `GET /api/ads/:id/publication-options`. Apenas encaminha o payload
 * — NUNCA toca preço, limite, eligibility ou actions. Esses valores
 * são calculados no service backend (`ads.publication-options.service.js`)
 * e a UI só lê.
 *
 * - 401 → resposta padrão authenticateBffRequest (caller redireciona /login).
 * - 404/410 → repassa status do backend pra UI mostrar estado vazio.
 * - 5xx → 502 com mensagem genérica.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

type Params = {
  params: { id: string };
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const adId = String(params.id || "").trim();
    if (!adId) {
      return NextResponse.json({ error: "ad_id e obrigatorio" }, { status: 400 });
    }

    const backendUrl = resolveInternalBackendApiUrl(
      `/api/ads/${encodeURIComponent(adId)}/publication-options`
    );
    if (!backendUrl) {
      return NextResponse.json(
        { error: "Backend nao configurado" },
        { status: 500 }
      );
    }

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        ...buildBffBackendForwardHeaders(request),
        Accept: "application/json",
        Authorization: `Bearer ${auth.ctx.session.accessToken}`,
      },
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}) as Record<string, unknown>);

    if (!response.ok) {
      const message =
        (body && typeof body === "object" && "message" in body
          ? (body as { message?: string }).message
          : null) ||
        (body && typeof body === "object" && "error" in body
          ? (body as { error?: string }).error
          : null) ||
        "Falha ao buscar opcoes de publicacao.";
      return applyBffCookies(
        NextResponse.json({ error: message }, { status: response.status }),
        auth.ctx
      );
    }

    const data =
      body && typeof body === "object" && "data" in body
        ? (body as { data: unknown }).data
        : body;

    return applyBffCookies(NextResponse.json(data), auth.ctx);
  } catch (error) {
    console.error(
      "[GET /api/ads/:id/publication-options]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Falha ao consultar opcoes de publicacao." },
      { status: 502 }
    );
  }
}
