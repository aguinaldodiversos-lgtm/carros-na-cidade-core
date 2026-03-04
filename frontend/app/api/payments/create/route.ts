import { NextRequest, NextResponse } from "next/server";
import { getAdByIdForUser, getBoostOptionById, registerBoostPaymentIntent } from "@/services/adService";
import { createOneTimePayment } from "@/services/paymentService";
import { getPlanById, getUserById, registerPayment, validatePublishEligibility } from "@/services/planStore";
import { getSessionUserFromRequest } from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Payload = {
  user_id?: string;
  plan_id?: string;
  success_url?: string;
  failure_url?: string;
  pending_url?: string;
  ad_id?: string;
  boost_option_id?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Payload;
  const session = getSessionUserFromRequest(request);
  const adId = body.ad_id?.trim();
  const boostOptionId = body.boost_option_id?.trim();

  if (adId || boostOptionId) {
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }
    if (!adId || !boostOptionId) {
      return NextResponse.json({ error: "ad_id e boost_option_id sao obrigatorios" }, { status: 400 });
    }

    const user = getUserById(session.id);
    if (!user) {
      return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
    }

    const ad = getAdByIdForUser(adId, session.id);
    if (!ad) {
      return NextResponse.json({ error: "Anuncio nao encontrado" }, { status: 404 });
    }

    const boostOption = getBoostOptionById(boostOptionId);
    if (!boostOption) {
      return NextResponse.json({ error: "Opcao de impulsionamento invalida" }, { status: 400 });
    }

    const origin = request.nextUrl.origin;
    const successUrl = body.success_url ?? `${origin}/pagamento/sucesso`;
    const failureUrl = body.failure_url ?? `${origin}/pagamento/erro`;
    const pendingUrl = body.pending_url ?? `${origin}/pagamento/erro`;
    const now = new Date().toISOString();

    const checkout = await createOneTimePayment({
      userId: session.id,
      plan: {
        id: `boost-${boostOption.id}`,
        name: boostOption.label,
        type: user.document_type,
        price: boostOption.price,
        ad_limit: 0,
        is_featured_enabled: true,
        has_store_profile: user.document_type === "CNPJ",
        priority_level: 100,
        is_active: true,
        validity_days: boostOption.days,
        created_at: now,
        updated_at: now,
        billing_model: "one_time",
        description: "Impulsionamento de anuncio",
        benefits: ["Destaque no topo da busca", "Mais prioridade no algoritmo IA"],
      },
      item: {
        id: `ad-boost-${ad.id}-${boostOption.id}`,
        title: `Impulsionar anuncio: ${ad.title}`,
        unit_price: boostOption.price,
      },
      successUrl,
      failureUrl,
      pendingUrl,
      metadata: {
        context: "ad_boost",
        ad_id: ad.id,
        boost_option_id: boostOption.id,
        boost_days: String(boostOption.days),
      },
    });

    registerBoostPaymentIntent({
      mercado_pago_id: checkout.mercadoPagoId,
      ad_id: ad.id,
      user_id: session.id,
      boost_option_id: boostOption.id,
      days: boostOption.days,
      amount: boostOption.price,
    });

    registerPayment({
      user_id: session.id,
      plan_id: `boost-${boostOption.id}`,
      mercado_pago_id: checkout.mercadoPagoId,
      status: "pending",
      amount: boostOption.price,
      payment_type: "one_time",
    });

    return NextResponse.json({
      context: "ad_boost",
      ad_id: ad.id,
      boost_option_id: boostOption.id,
      init_point: checkout.initPoint,
      mercado_pago_id: checkout.mercadoPagoId,
      public_key: checkout.publicKey,
    });
  }

  const userId = body.user_id?.trim() ?? session?.id;
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

  if (plan.price <= 0 || plan.billing_model !== "one_time") {
    return NextResponse.json({ error: "Este endpoint aceita apenas pagamento unico" }, { status: 400 });
  }

  const eligibility = validatePublishEligibility(userId);
  if (!eligibility.allowed && plan.type !== user.document_type) {
    return NextResponse.json({ error: "Plano incompativel com o tipo de conta do usuario" }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const successUrl = body.success_url ?? `${origin}/pagamento/sucesso`;
  const failureUrl = body.failure_url ?? `${origin}/pagamento/erro`;
  const pendingUrl = body.pending_url ?? `${origin}/pagamento/erro`;

  const checkout = await createOneTimePayment({
    userId,
    plan,
    successUrl,
    failureUrl,
    pendingUrl,
  });

  registerPayment({
    user_id: userId,
    plan_id: plan.id,
    mercado_pago_id: checkout.mercadoPagoId,
    status: "pending",
    amount: plan.price,
    payment_type: "one_time",
  });

  return NextResponse.json({
    plan_id: plan.id,
    payment_type: "one_time",
    init_point: checkout.initPoint,
    mercado_pago_id: checkout.mercadoPagoId,
    public_key: checkout.publicKey,
  });
}
