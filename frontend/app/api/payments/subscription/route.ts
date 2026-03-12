import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionCheckout } from "@/lib/account/backend-account";
import { getSessionDataFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  plan_id?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const planId = body.plan_id?.trim();
  const session = getSessionDataFromRequest(request);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  if (!planId) {
    return NextResponse.json({ error: "plan_id e obrigatorio" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  try {
    const payload = await createSubscriptionCheckout(session, {
      plan_id: planId,
      success_url: `${origin}/pagamento/sucesso`,
      failure_url: `${origin}/pagamento/erro`,
      pending_url: `${origin}/pagamento/erro`,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao iniciar assinatura." },
      { status: 400 }
    );
  }
}
