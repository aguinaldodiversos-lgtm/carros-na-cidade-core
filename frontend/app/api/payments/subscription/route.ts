import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@/lib/account/backend-account";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

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

    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const origin = request.nextUrl.origin;
    const payload = await createSubscriptionCheckout(auth.ctx.session, {
      plan_id: planId,
      success_url: `${origin}/pagamento/sucesso`,
      failure_url: `${origin}/pagamento/erro`,
      pending_url: `${origin}/pagamento/erro`,
    });

    return applyBffCookies(NextResponse.json(payload), auth.ctx);
  } catch (error) {
    console.error(
      "[POST /api/payments/subscription]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao iniciar assinatura." },
      { status: 400 }
    );
  }
}
