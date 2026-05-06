/**
 * BFF: POST /api/payments/boost-7d/checkout (Fase 3B / Fase 4).
 *
 * Proxy estrito pra rota dedicada de checkout do Destaque 7 dias no
 * backend (`/api/payments/boost-7d/checkout`). Aceita apenas `ad_id`
 * no body — boost_option_id é fixado no servidor como "boost-7d" e o
 * preço (R$ 39,90) é lido do BOOST_OPTIONS no backend, NUNCA do client.
 *
 * Defesas:
 *   - body.ad_id obrigatório (400 se ausente);
 *   - amount/price/days/boost_option_id no body são IGNORADOS — não são
 *     repassados ao backend.
 *
 * Sucesso: 200 com { context, ad_id, boost_option_id, init_point, ... }
 * — frontend redireciona pro init_point do Mercado Pago.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

type Payload = {
  ad_id?: string;
  success_url?: string;
  failure_url?: string;
  pending_url?: string;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Payload;
    const adId = String(body.ad_id || "").trim();

    if (!adId) {
      return NextResponse.json({ error: "ad_id e obrigatorio" }, { status: 400 });
    }

    const backendUrl = resolveBackendApiUrl("/api/payments/boost-7d/checkout");
    if (!backendUrl) {
      return NextResponse.json(
        { error: "Backend nao configurado" },
        { status: 500 }
      );
    }

    const origin = request.nextUrl.origin;
    const forwardBody: Record<string, string> = {
      ad_id: adId,
      success_url: body.success_url || `${origin}/pagamento/sucesso`,
      failure_url: body.failure_url || `${origin}/pagamento/erro`,
      pending_url: body.pending_url || `${origin}/pagamento/erro`,
    };

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.ctx.session.accessToken}`,
      },
      body: JSON.stringify(forwardBody),
      cache: "no-store",
    });

    const responseBody = await response
      .json()
      .catch(() => ({}) as Record<string, unknown>);

    if (!response.ok) {
      const message =
        (responseBody as { error?: string; message?: string }).error ||
        (responseBody as { error?: string; message?: string }).message ||
        "Falha ao iniciar checkout do destaque.";
      return applyBffCookies(
        NextResponse.json({ error: message }, { status: response.status }),
        auth.ctx
      );
    }

    return applyBffCookies(NextResponse.json(responseBody), auth.ctx);
  } catch (error) {
    console.error(
      "[POST /api/payments/boost-7d/checkout]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Falha ao iniciar checkout do destaque." },
      { status: 502 }
    );
  }
}
