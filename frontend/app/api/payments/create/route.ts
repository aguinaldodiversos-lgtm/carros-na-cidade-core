import { NextRequest, NextResponse } from "next/server";
import { createPaymentCheckout } from "@/lib/account/backend-account";
import { getSessionDataFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  plan_id?: string;
  ad_id?: string;
  boost_option_id?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const session = getSessionDataFromRequest(request);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  try {
    const payload = await createPaymentCheckout(session, {
      plan_id: body.plan_id?.trim(),
      ad_id: body.ad_id?.trim(),
      boost_option_id: body.boost_option_id?.trim(),
      success_url: `${origin}/pagamento/sucesso`,
      failure_url: `${origin}/pagamento/erro`,
      pending_url: `${origin}/pagamento/erro`,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao iniciar checkout." },
      { status: 400 }
    );
  }
}
