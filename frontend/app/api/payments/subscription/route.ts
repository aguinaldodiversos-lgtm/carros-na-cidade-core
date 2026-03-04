import { NextRequest, NextResponse } from "next/server";
import { createRecurringSubscription } from "@/services/paymentService";
import { getPlanById, getUserById, registerPayment } from "@/services/planStore";

export const dynamic = "force-dynamic";

type Payload = {
  user_id?: string;
  plan_id?: string;
  success_url?: string;
  failure_url?: string;
  pending_url?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const userId = body.user_id?.trim();
  const planId = body.plan_id?.trim();

  if (!userId || !planId) {
    return NextResponse.json({ error: "user_id e plan_id sao obrigatorios" }, { status: 400 });
  }

  const user = getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
  }

  const plan = getPlanById(planId);
  if (!plan || !plan.is_active) {
    return NextResponse.json({ error: "Plano nao encontrado ou inativo" }, { status: 404 });
  }

  if (plan.price <= 0 || plan.billing_model !== "monthly") {
    return NextResponse.json({ error: "Este endpoint aceita apenas assinaturas recorrentes" }, { status: 400 });
  }

  if (plan.type !== user.document_type) {
    return NextResponse.json({ error: "Plano incompativel com o tipo da conta" }, { status: 400 });
  }

  if (user.document_type === "CNPJ" && !user.cnpj_verified) {
    return NextResponse.json({ error: "CNPJ precisa estar verificado para contratar plano de loja" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const successUrl = body.success_url ?? `${origin}/pagamento/sucesso`;
  const failureUrl = body.failure_url ?? `${origin}/pagamento/erro`;
  const pendingUrl = body.pending_url ?? `${origin}/pagamento/erro`;

  const subscription = await createRecurringSubscription({
    userId,
    plan,
    successUrl,
    failureUrl,
    pendingUrl,
  });

  registerPayment({
    user_id: userId,
    plan_id: plan.id,
    mercado_pago_id: subscription.mercadoPagoId,
    status: "pending",
    amount: plan.price,
    payment_type: "recurring",
  });

  return NextResponse.json({
    plan_id: plan.id,
    payment_type: "recurring",
    init_point: subscription.initPoint,
    mercado_pago_id: subscription.mercadoPagoId,
    public_key: subscription.publicKey,
  });
}
