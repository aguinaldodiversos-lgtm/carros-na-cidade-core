import crypto from "crypto";
import type { PaymentStatus, PaymentType, SubscriptionPlan } from "@/services/planStore";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const MP_API_BASE = "https://api.mercadopago.com";

type CreateCheckoutInput = {
  userId: string;
  plan: SubscriptionPlan;
  successUrl: string;
  failureUrl: string;
  pendingUrl: string;
  item?: {
    id: string;
    title: string;
    unit_price: number;
  };
  metadata?: Record<string, string>;
};

type MPPreferenceResponse = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

type MPPreapprovalResponse = {
  id: string;
  init_point: string;
};

async function mpRequest<T>(path: string, init: RequestInit): Promise<T> {
  if (!MP_ACCESS_TOKEN) {
    throw new Error("Mercado Pago token ausente");
  }

  const response = await fetch(`${MP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago error (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function createOneTimePayment(input: CreateCheckoutInput) {
  if (!MP_ACCESS_TOKEN) {
    return {
      paymentProvider: "mercado_pago" as const,
      mercadoPagoId: `mock-preference-${input.item?.id ?? input.plan.id}-${Date.now()}`,
      initPoint: `${input.successUrl}?mock=1&plan=${input.plan.id}`,
      publicKey: MP_PUBLIC_KEY ?? "",
    };
  }

  const idempotency = crypto.randomUUID();
  const item = input.item ?? {
    id: input.plan.id,
    title: input.plan.name,
    unit_price: Number(input.plan.price.toFixed(2)),
  };

  const payload = {
    items: [
      {
        id: item.id,
        title: item.title,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(item.unit_price.toFixed(2)),
      },
    ],
    payer: {
      id: input.userId,
    },
    back_urls: {
      success: input.successUrl,
      failure: input.failureUrl,
      pending: input.pendingUrl,
    },
    notification_url: `${new URL(input.successUrl).origin}/api/payments/webhook`,
    metadata: {
      user_id: input.userId,
      plan_id: input.plan.id,
      payment_type: "one_time",
      ...(input.metadata ?? {}),
    },
  };

  const preference = await mpRequest<MPPreferenceResponse>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "X-Idempotency-Key": idempotency,
    },
  });

  return {
    paymentProvider: "mercado_pago" as const,
    mercadoPagoId: preference.id,
    initPoint: preference.init_point,
    publicKey: MP_PUBLIC_KEY ?? "",
  };
}

export async function createRecurringSubscription(input: CreateCheckoutInput) {
  if (!MP_ACCESS_TOKEN) {
    return {
      paymentProvider: "mercado_pago" as const,
      mercadoPagoId: `mock-preapproval-${input.plan.id}-${Date.now()}`,
      initPoint: `${input.successUrl}?mock=1&subscription=1&plan=${input.plan.id}`,
      publicKey: MP_PUBLIC_KEY ?? "",
    };
  }

  const payload = {
    reason: input.plan.name,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: Number(input.plan.price.toFixed(2)),
      currency_id: "BRL",
    },
    back_url: input.successUrl,
    status: "pending",
    payer_email: `${input.userId}@carrosnacidade.local`,
    notification_url: `${new URL(input.successUrl).origin}/api/payments/webhook`,
    metadata: {
      user_id: input.userId,
      plan_id: input.plan.id,
      payment_type: "recurring",
    },
  };

  const preapproval = await mpRequest<MPPreapprovalResponse>("/preapproval", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    paymentProvider: "mercado_pago" as const,
    mercadoPagoId: preapproval.id,
    initPoint: preapproval.init_point,
    publicKey: MP_PUBLIC_KEY ?? "",
  };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, requestIdHeader: string | null) {
  if (!MP_WEBHOOK_SECRET) {
    return true;
  }
  if (!signatureHeader || !requestIdHeader) {
    return false;
  }

  const pairs = signatureHeader.split(",").map((part) => part.trim());
  const tsPair = pairs.find((part) => part.startsWith("ts="));
  const v1Pair = pairs.find((part) => part.startsWith("v1="));
  if (!tsPair || !v1Pair) {
    return false;
  }

  const ts = tsPair.replace("ts=", "");
  const v1 = v1Pair.replace("v1=", "");
  const manifest = `id:${requestIdHeader};request-id:${requestIdHeader};ts:${ts};`;
  const expected = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest + rawBody).digest("hex");
  return expected === v1;
}

export async function fetchPaymentStatus(resourceId: string, topic: "payment" | "preapproval") {
  if (!MP_ACCESS_TOKEN) {
    return {
      mercadoPagoId: resourceId,
      status: "approved" as PaymentStatus,
      amount: 0,
      paymentType: (topic === "preapproval" ? "recurring" : "one_time") as PaymentType,
      metadata: {},
    };
  }

  if (topic === "preapproval") {
    type Response = {
      id: string;
      status: string;
      auto_recurring?: { transaction_amount?: number };
      metadata?: Record<string, string>;
    };
    const response = await mpRequest<Response>(`/preapproval/${resourceId}`, { method: "GET" });
    const statusMap: Record<string, PaymentStatus> = {
      authorized: "approved",
      paused: "pending",
      cancelled: "canceled",
      pending: "pending",
    };
    return {
      mercadoPagoId: response.id,
      status: statusMap[response.status] ?? "pending",
      amount: response.auto_recurring?.transaction_amount ?? 0,
      paymentType: "recurring" as PaymentType,
      metadata: response.metadata ?? {},
    };
  }

  type PaymentResponse = {
    id: number;
    status: string;
    transaction_amount: number;
    metadata?: Record<string, string>;
  };
  const payment = await mpRequest<PaymentResponse>(`/v1/payments/${resourceId}`, { method: "GET" });
  const statusMap: Record<string, PaymentStatus> = {
    approved: "approved",
    authorized: "approved",
    in_process: "pending",
    pending: "pending",
    rejected: "rejected",
    cancelled: "canceled",
  };

  return {
    mercadoPagoId: String(payment.id),
    status: statusMap[payment.status] ?? "pending",
    amount: payment.transaction_amount ?? 0,
    paymentType: "one_time" as PaymentType,
    metadata: payment.metadata ?? {},
  };
}
