import { NextRequest, NextResponse } from "next/server";
import { createPaymentCheckout } from "@/lib/account/backend-account";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

type Payload = {
  plan_id?: string;
  ad_id?: string;
  boost_option_id?: string;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as Payload;
    const origin = request.nextUrl.origin;
    const payload = await createPaymentCheckout(auth.ctx.session, {
      plan_id: body.plan_id?.trim(),
      ad_id: body.ad_id?.trim(),
      boost_option_id: body.boost_option_id?.trim(),
      success_url: `${origin}/pagamento/sucesso`,
      failure_url: `${origin}/pagamento/erro`,
      pending_url: `${origin}/pagamento/erro`,
    });

    return applyBffCookies(NextResponse.json(payload), auth.ctx);
  } catch (error) {
    console.error("[POST /api/payments/create]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao iniciar checkout." },
      { status: 400 }
    );
  }
}
