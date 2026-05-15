/**
 * BFF: POST /api/payments/subscriptions/checkout (Fase 3C — Start/Pro).
 *
 * Proxy pra rota dedicada de assinatura recorrente Start/Pro
 * (`/api/payments/subscriptions/checkout`). Por defesa, fica atrás
 * da feature flag `SUBSCRIPTIONS_LIVE` (env). Por padrão, a rota
 * devolve 503 em produção até que sandbox ↔ prod estejam validados
 * (ver docs/runbooks/mercado-pago-subscriptions-start-pro.md).
 *
 * Em dev, a rota está aberta sempre — facilita testes locais.
 *
 * Whitelist de plan_id no backend: cnpj-store-start | cnpj-store-pro.
 * Aqui validamos o mesmo whitelist pra dar 400 cedo, mas o backend
 * é a fonte de verdade.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";

export const dynamic = "force-dynamic";

const ALLOWED_PLANS = new Set(["cnpj-store-start", "cnpj-store-pro"]);

function subscriptionsLive(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.SUBSCRIPTIONS_LIVE === "1";
}

type Payload = {
  plan_id?: string;
  success_url?: string;
  failure_url?: string;
  pending_url?: string;
};

export async function POST(request: NextRequest) {
  try {
    if (!subscriptionsLive()) {
      return NextResponse.json(
        {
          error:
            "Assinaturas Start/Pro em validacao. Voltam em breve apos o checklist sandbox-prod.",
        },
        { status: 503 }
      );
    }

    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Payload;
    const planId = String(body.plan_id || "").trim();

    if (!planId) {
      return NextResponse.json({ error: "plan_id e obrigatorio" }, { status: 400 });
    }
    if (!ALLOWED_PLANS.has(planId)) {
      return NextResponse.json(
        { error: "plan_id nao suportado nesta rota dedicada" },
        { status: 400 }
      );
    }

    const backendUrl = resolveInternalBackendApiUrl("/api/payments/subscriptions/checkout");
    if (!backendUrl) {
      return NextResponse.json(
        { error: "Backend nao configurado" },
        { status: 500 }
      );
    }

    const origin = request.nextUrl.origin;
    const forwardBody = {
      plan_id: planId,
      success_url: body.success_url || `${origin}/pagamento/sucesso`,
      failure_url: body.failure_url || `${origin}/pagamento/erro`,
      pending_url: body.pending_url || `${origin}/pagamento/erro`,
    };

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        ...buildBffBackendForwardHeaders(request),
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
        "Falha ao iniciar checkout da assinatura.";
      return applyBffCookies(
        NextResponse.json({ error: message }, { status: response.status }),
        auth.ctx
      );
    }

    return applyBffCookies(NextResponse.json(responseBody), auth.ctx);
  } catch (error) {
    console.error(
      "[POST /api/payments/subscriptions/checkout]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Falha ao iniciar checkout da assinatura." },
      { status: 502 }
    );
  }
}
