import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  plan_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Payload;
    const planId = body.plan_id?.trim();

    if (!planId) {
      return NextResponse.json({ error: "plan_id e obrigatorio" }, { status: 400 });
    }

    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const origin = request.nextUrl.origin;
    const payload = await createSubscriptionCheckout(ensured.session, {
      plan_id: planId,
      success_url: `${origin}/pagamento/sucesso`,
      failure_url: `${origin}/pagamento/erro`,
      pending_url: `${origin}/pagamento/erro`,
    });

    const res = NextResponse.json(payload);
    if (ensured.persistCookies) {
      applySessionCookiesToResponse(res, ensured.persistCookies);
    }
    return res;
  } catch (error) {
    console.error("[POST /api/payments/subscription]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao iniciar assinatura." },
      { status: 400 }
    );
  }
}
