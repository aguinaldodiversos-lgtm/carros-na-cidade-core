import { NextRequest, NextResponse } from "next/server";
import { applyBoostToAd, getBoostPaymentByMercadoPagoId, updateBoostPaymentStatus } from "@/services/adService";
import { applyAdBoostMetrics } from "@/services/aiService";
import { fetchPaymentStatus, verifyWebhookSignature } from "@/services/paymentService";
import {
  createOrUpdateSubscription,
  getPlanById,
  markWebhookEventProcessed,
  registerPayment,
} from "@/services/planStore";

export const dynamic = "force-dynamic";

type WebhookPayload = {
  action?: string;
  type?: string;
  data?: {
    id?: string | number;
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");

  const isValid = verifyWebhookSignature(rawBody, signature, requestId);
  if (!isValid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as WebhookPayload;
  const resourceId = String(payload.data?.id ?? "");
  if (!resourceId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventId = `${payload.type ?? "payment"}:${resourceId}`;
  const firstProcess = markWebhookEventProcessed(eventId);
  if (!firstProcess) {
    return NextResponse.json({ ok: true, duplicated: true });
  }

  const topic = payload.type === "preapproval" ? "preapproval" : "payment";
  const paymentData = await fetchPaymentStatus(resourceId, topic);
  const metadata = (paymentData.metadata ?? {}) as Record<string, string | undefined>;
  const context = String(metadata.context ?? "");

  if (context === "ad_boost") {
    const boostUserId = String(metadata.user_id ?? "");
    const boostAdId = String(metadata.ad_id ?? "");
    const boostOptionId = String(metadata.boost_option_id ?? "");
    const boostDays = Number(metadata.boost_days ?? "0");

    if (!boostUserId || !boostAdId || !boostDays) {
      return NextResponse.json({ ok: true, warning: "missing boost metadata" });
    }

    const knownBoostPayment = getBoostPaymentByMercadoPagoId(paymentData.mercadoPagoId);
    if (!knownBoostPayment) {
      return NextResponse.json({ ok: true, warning: "boost payment not found" });
    }

    updateBoostPaymentStatus(paymentData.mercadoPagoId, paymentData.status);

    registerPayment({
      user_id: boostUserId,
      plan_id: `boost-${boostOptionId || boostDays}`,
      mercado_pago_id: paymentData.mercadoPagoId,
      status: paymentData.status,
      amount: paymentData.amount || knownBoostPayment.amount,
      payment_type: "one_time",
    });

    if (paymentData.status === "approved") {
      const updatedAd = applyBoostToAd(boostAdId, boostDays);
      if (updatedAd) {
        await applyAdBoostMetrics({
          adId: updatedAd.id,
          userId: boostUserId,
          boostDays,
          priorityLevel: updatedAd.priority_level,
        });
      }
    }

    return NextResponse.json({ ok: true, context: "ad_boost" });
  }

  const metadataUserId = String(metadata.user_id ?? "");
  const metadataPlanId = String(metadata.plan_id ?? "");

  if (!metadataUserId || !metadataPlanId) {
    return NextResponse.json({ ok: true, warning: "missing metadata" });
  }

  const plan = getPlanById(metadataPlanId);
  if (!plan) {
    return NextResponse.json({ ok: true, warning: "plan not found" });
  }

  registerPayment({
    user_id: metadataUserId,
    plan_id: metadataPlanId,
    mercado_pago_id: paymentData.mercadoPagoId,
    status: paymentData.status,
    amount: paymentData.amount || plan.price,
    payment_type: paymentData.paymentType,
  });

  const isApproved = paymentData.status === "approved";
  const expiresAt =
    isApproved && plan.validity_days
      ? new Date(Date.now() + plan.validity_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

  createOrUpdateSubscription({
    user_id: metadataUserId,
    plan_id: metadataPlanId,
    status: isApproved ? "active" : paymentData.status === "pending" ? "pending" : "canceled",
    expires_at: expiresAt,
    payment_id: paymentData.mercadoPagoId,
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
