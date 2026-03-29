import crypto from "crypto";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { query, withTransaction } from "../../infrastructure/database/db.js";
import { getAccountUser, getOwnedAd, getPlanById, listBoostOptions } from "../account/account.service.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || "";
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const MP_API_BASE = "https://api.mercadopago.com";

let schemaReadyPromise = null;

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function getBackendPublicUrl() {
  const value =
    process.env.APP_BASE_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";

  if (!value) {
    throw new AppError("URL pública do backend não configurada para webhook.", 500);
  }

  return stripTrailingSlash(value);
}

async function ensurePaymentsSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(`
      CREATE TABLE IF NOT EXISTS payment_intents (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        context text NOT NULL CHECK (context IN ('plan', 'boost')),
        plan_id text REFERENCES subscription_plans(id),
        ad_id text,
        boost_option_id text,
        amount numeric(12,2) NOT NULL DEFAULT 0,
        checkout_resource_id text,
        checkout_resource_type text CHECK (checkout_resource_type IN ('preference', 'preapproval')),
        payment_resource_id text UNIQUE,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );
    `).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

async function mpRequest(path, init) {
  if (!MP_ACCESS_TOKEN) {
    throw new AppError("Mercado Pago token ausente.", 500);
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
    throw new AppError(`Mercado Pago error (${response.status}): ${body}`, 502);
  }

  return response.json();
}

function serializeMetadata(value) {
  return JSON.stringify(value || {});
}

async function insertPaymentIntent(intent) {
  await ensurePaymentsSchema();

  await query(
    `
    INSERT INTO payment_intents (
      id,
      user_id,
      context,
      plan_id,
      ad_id,
      boost_option_id,
      amount,
      checkout_resource_id,
      checkout_resource_type,
      payment_resource_id,
      status,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
    `,
    [
      intent.id,
      intent.user_id,
      intent.context,
      intent.plan_id ?? null,
      intent.ad_id ?? null,
      intent.boost_option_id ?? null,
      intent.amount,
      intent.checkout_resource_id ?? null,
      intent.checkout_resource_type ?? null,
      intent.payment_resource_id ?? null,
      intent.status ?? "pending",
      serializeMetadata(intent.metadata),
    ]
  );
}

async function getPaymentIntentById(intentId) {
  await ensurePaymentsSchema();
  const result = await query(
    `
    SELECT *
    FROM payment_intents
    WHERE id = $1
    LIMIT 1
    `,
    [intentId]
  );

  return result.rows[0] || null;
}

function resolveSubscriptionStatus(paymentStatus) {
  if (paymentStatus === "approved") return "active";
  if (paymentStatus === "pending") return "pending";
  return "canceled";
}

function resolveExpiryDate(validityDays) {
  if (!validityDays) return null;
  return new Date(Date.now() + Number(validityDays) * 24 * 60 * 60 * 1000).toISOString();
}

export async function createPlanCheckout({
  userId,
  planId,
  successUrl,
  failureUrl,
  pendingUrl,
  requestId,
}) {
  const [user, plan] = await Promise.all([getAccountUser(userId), getPlanById(planId)]);

  if (!plan || !plan.is_active) {
    throw new AppError("Plano nao encontrado ou inativo.", 404);
  }
  if (plan.billing_model !== "one_time" || Number(plan.price) <= 0) {
    throw new AppError("Este endpoint aceita apenas pagamentos unicos.", 400);
  }
  if (plan.type !== user.type) {
    throw new AppError("Plano incompativel com o tipo da conta.", 400);
  }
  if (user.type === "CNPJ" && !user.cnpj_verified) {
    throw new AppError("CNPJ precisa estar verificado para contratar plano de loja.", 400);
  }

  const intentId = crypto.randomUUID();
  const metadata = {
    intent_id: intentId,
    context: "plan",
    user_id: user.id,
    plan_id: plan.id,
    payment_type: "one_time",
  };

  if (!MP_ACCESS_TOKEN) {
    const mercadoPagoId = `mock-preference-${plan.id}-${Date.now()}`;
    await insertPaymentIntent({
      id: intentId,
      user_id: user.id,
      context: "plan",
      plan_id: plan.id,
      amount: Number(plan.price),
      checkout_resource_id: mercadoPagoId,
      checkout_resource_type: "preference",
      status: "pending",
      metadata,
    });

    logger.info(
      {
        ...buildDomainFields({
          action: "payments.checkout.plan",
          result: "success",
          requestId,
          userId,
        }),
        planId: plan.id,
        intentId,
        mock: true,
      },
      "[payments] checkout plan (mock)"
    );

    return {
      plan_id: plan.id,
      payment_type: "one_time",
      init_point: `${successUrl}?mock=1&plan=${encodeURIComponent(plan.id)}`,
      mercado_pago_id: mercadoPagoId,
      public_key: MP_PUBLIC_KEY,
    };
  }

  const preference = await mpRequest("/checkout/preferences", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": intentId,
    },
    body: JSON.stringify({
      external_reference: intentId,
      items: [
        {
          id: plan.id,
          title: plan.name,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(Number(plan.price).toFixed(2)),
        },
      ],
      payer: {
        id: user.id,
        email: user.email || undefined,
      },
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      notification_url: `${getBackendPublicUrl()}/api/payments/webhook`,
      metadata,
    }),
  });

  await insertPaymentIntent({
    id: intentId,
    user_id: user.id,
    context: "plan",
    plan_id: plan.id,
    amount: Number(plan.price),
    checkout_resource_id: preference.id,
    checkout_resource_type: "preference",
    status: "pending",
    metadata,
  });

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.checkout.plan",
        result: "success",
        requestId,
        userId,
      }),
      planId: plan.id,
      intentId,
      mercadoPagoId: preference.id,
    },
    "[payments] checkout plan criado"
  );

  return {
    plan_id: plan.id,
    payment_type: "one_time",
    init_point: preference.init_point,
    mercado_pago_id: preference.id,
    public_key: MP_PUBLIC_KEY,
  };
}

export async function createPlanSubscription({
  userId,
  planId,
  successUrl,
  requestId,
}) {
  const [user, plan] = await Promise.all([getAccountUser(userId), getPlanById(planId)]);

  if (!plan || !plan.is_active) {
    throw new AppError("Plano nao encontrado ou inativo.", 404);
  }
  if (plan.billing_model !== "monthly" || Number(plan.price) <= 0) {
    throw new AppError("Este endpoint aceita apenas assinaturas recorrentes.", 400);
  }
  if (plan.type !== user.type) {
    throw new AppError("Plano incompativel com o tipo da conta.", 400);
  }
  if (user.type === "CNPJ" && !user.cnpj_verified) {
    throw new AppError("CNPJ precisa estar verificado para contratar plano de loja.", 400);
  }

  const intentId = crypto.randomUUID();
  const metadata = {
    intent_id: intentId,
    context: "plan",
    user_id: user.id,
    plan_id: plan.id,
    payment_type: "recurring",
  };

  if (!MP_ACCESS_TOKEN) {
    const mercadoPagoId = `mock-preapproval-${plan.id}-${Date.now()}`;
    await insertPaymentIntent({
      id: intentId,
      user_id: user.id,
      context: "plan",
      plan_id: plan.id,
      amount: Number(plan.price),
      checkout_resource_id: mercadoPagoId,
      checkout_resource_type: "preapproval",
      payment_resource_id: mercadoPagoId,
      status: "pending",
      metadata,
    });

    logger.info(
      {
        ...buildDomainFields({
          action: "payments.checkout.subscription",
          result: "success",
          requestId,
          userId,
        }),
        planId: plan.id,
        intentId,
        mock: true,
      },
      "[payments] subscription checkout (mock)"
    );

    return {
      plan_id: plan.id,
      payment_type: "recurring",
      init_point: `${successUrl}?mock=1&subscription=1&plan=${encodeURIComponent(plan.id)}`,
      mercado_pago_id: mercadoPagoId,
      public_key: MP_PUBLIC_KEY,
    };
  }

  const preapproval = await mpRequest("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: plan.name,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number(Number(plan.price).toFixed(2)),
        currency_id: "BRL",
      },
      back_url: successUrl,
      status: "pending",
      payer_email: user.email || `${user.id}@carrosnacidade.local`,
      notification_url: `${getBackendPublicUrl()}/api/payments/webhook`,
      metadata,
    }),
  });

  await insertPaymentIntent({
    id: intentId,
    user_id: user.id,
    context: "plan",
    plan_id: plan.id,
    amount: Number(plan.price),
    checkout_resource_id: preapproval.id,
    checkout_resource_type: "preapproval",
    payment_resource_id: preapproval.id,
    status: "pending",
    metadata,
  });

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.checkout.subscription",
        result: "success",
        requestId,
        userId,
      }),
      planId: plan.id,
      intentId,
      mercadoPagoId: preapproval.id,
    },
    "[payments] subscription checkout criado"
  );

  return {
    plan_id: plan.id,
    payment_type: "recurring",
    init_point: preapproval.init_point,
    mercado_pago_id: preapproval.id,
    public_key: MP_PUBLIC_KEY,
  };
}

export async function createBoostCheckout({
  userId,
  adId,
  boostOptionId,
  successUrl,
  failureUrl,
  pendingUrl,
  requestId,
}) {
  const [user, ad] = await Promise.all([getAccountUser(userId), getOwnedAd(userId, adId)]);
  const boostOption = listBoostOptions().find((option) => option.id === boostOptionId);

  if (!boostOption) {
    throw new AppError("Opcao de impulsionamento invalida.", 400);
  }

  const intentId = crypto.randomUUID();
  const metadata = {
    intent_id: intentId,
    context: "boost",
    user_id: user.id,
    ad_id: ad.id,
    boost_option_id: boostOption.id,
    boost_days: String(boostOption.days),
    payment_type: "one_time",
  };

  if (!MP_ACCESS_TOKEN) {
    const mercadoPagoId = `mock-preference-boost-${boostOption.id}-${Date.now()}`;
    await insertPaymentIntent({
      id: intentId,
      user_id: user.id,
      context: "boost",
      ad_id: ad.id,
      boost_option_id: boostOption.id,
      amount: Number(boostOption.price),
      checkout_resource_id: mercadoPagoId,
      checkout_resource_type: "preference",
      status: "pending",
      metadata,
    });

    logger.info(
      {
        ...buildDomainFields({
          action: "payments.checkout.boost",
          result: "success",
          requestId,
          userId,
        }),
        adId: ad.id,
        intentId,
        mock: true,
      },
      "[payments] boost checkout (mock)"
    );

    return {
      context: "ad_boost",
      ad_id: ad.id,
      boost_option_id: boostOption.id,
      init_point: `${successUrl}?mock=1&boost=${encodeURIComponent(boostOption.id)}`,
      mercado_pago_id: mercadoPagoId,
      public_key: MP_PUBLIC_KEY,
    };
  }

  const preference = await mpRequest("/checkout/preferences", {
    method: "POST",
    headers: {
      "X-Idempotency-Key": intentId,
    },
    body: JSON.stringify({
      external_reference: intentId,
      items: [
        {
          id: `ad-boost-${ad.id}-${boostOption.id}`,
          title: `Impulsionar anuncio: ${ad.title}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(Number(boostOption.price).toFixed(2)),
        },
      ],
      payer: {
        id: user.id,
        email: user.email || undefined,
      },
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: pendingUrl,
      },
      notification_url: `${getBackendPublicUrl()}/api/payments/webhook`,
      metadata,
    }),
  });

  await insertPaymentIntent({
    id: intentId,
    user_id: user.id,
    context: "boost",
    ad_id: ad.id,
    boost_option_id: boostOption.id,
    amount: Number(boostOption.price),
    checkout_resource_id: preference.id,
    checkout_resource_type: "preference",
    status: "pending",
    metadata,
  });

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.checkout.boost",
        result: "success",
        requestId,
        userId,
      }),
      adId: ad.id,
      intentId,
      mercadoPagoId: preference.id,
    },
    "[payments] boost checkout criado"
  );

  return {
    context: "ad_boost",
    ad_id: ad.id,
    boost_option_id: boostOption.id,
    init_point: preference.init_point,
    mercado_pago_id: preference.id,
    public_key: MP_PUBLIC_KEY,
  };
}

export function verifyWebhookSignature(rawBody, signatureHeader, requestIdHeader) {
  if (!MP_WEBHOOK_SECRET) {
    return true;
  }
  if (!signatureHeader || !requestIdHeader) {
    return false;
  }

  const pairs = String(signatureHeader)
    .split(",")
    .map((part) => part.trim());
  const tsPair = pairs.find((part) => part.startsWith("ts="));
  const v1Pair = pairs.find((part) => part.startsWith("v1="));

  if (!tsPair || !v1Pair) {
    return false;
  }

  const ts = tsPair.replace("ts=", "");
  const v1 = v1Pair.replace("v1=", "");
  const manifest = `id:${requestIdHeader};request-id:${requestIdHeader};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", MP_WEBHOOK_SECRET)
    .update(manifest + rawBody)
    .digest("hex");

  return expected === v1;
}

async function fetchPaymentStatus(resourceId, topic) {
  if (!MP_ACCESS_TOKEN) {
    return {
      mercadoPagoId: resourceId,
      status: "approved",
      amount: 0,
      paymentType: topic === "preapproval" ? "recurring" : "one_time",
      metadata: {},
      externalReference: null,
    };
  }

  if (topic === "preapproval") {
    const response = await mpRequest(`/preapproval/${resourceId}`, { method: "GET" });
    const statusMap = {
      authorized: "approved",
      paused: "pending",
      cancelled: "canceled",
      pending: "pending",
    };

    return {
      mercadoPagoId: String(response.id),
      status: statusMap[response.status] || "pending",
      amount: Number(response.auto_recurring?.transaction_amount || 0),
      paymentType: "recurring",
      metadata: response.metadata || {},
      externalReference: response.external_reference || null,
    };
  }

  const payment = await mpRequest(`/v1/payments/${resourceId}`, { method: "GET" });
  const statusMap = {
    approved: "approved",
    authorized: "approved",
    in_process: "pending",
    pending: "pending",
    rejected: "rejected",
    cancelled: "canceled",
  };

  return {
    mercadoPagoId: String(payment.id),
    status: statusMap[payment.status] || "pending",
    amount: Number(payment.transaction_amount || 0),
    paymentType: "one_time",
    metadata: payment.metadata || {},
    externalReference: payment.external_reference || null,
  };
}

async function resolveIntentForWebhook(paymentData, resourceId) {
  const intentId =
    String(paymentData.metadata?.intent_id || "").trim() ||
    String(paymentData.externalReference || "").trim();

  if (intentId) {
    const byId = await getPaymentIntentById(intentId);
    if (byId) return byId;
  }

  await ensurePaymentsSchema();
  const result = await query(
    `
    SELECT *
    FROM payment_intents
    WHERE checkout_resource_id = $1
       OR payment_resource_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [resourceId]
  );

  return result.rows[0] || null;
}

async function upsertPlanPayment(client, intent, paymentData) {
  const paymentId = paymentData.mercadoPagoId;
  const amount = Number(paymentData.amount || intent.amount || 0);

  await client.query(
    `
    INSERT INTO payments (
      user_id,
      plan_id,
      mercado_pago_id,
      status,
      amount,
      payment_type
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (mercado_pago_id)
    DO UPDATE
    SET
      status = EXCLUDED.status,
      amount = EXCLUDED.amount,
      payment_type = EXCLUDED.payment_type,
      updated_at = NOW()
    `,
    [
      intent.user_id,
      intent.plan_id,
      paymentId,
      paymentData.status,
      amount,
      paymentData.paymentType,
    ]
  );
}

async function upsertUserSubscription(client, { userId, planId, paymentId, status, expiresAt }) {
  const existing = await client.query(
    `
    SELECT user_id, plan_id, created_at
    FROM user_subscriptions
    WHERE payment_id = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [paymentId]
  );

  if (existing.rows[0]) {
    await client.query(
      `
      UPDATE user_subscriptions
      SET plan_id = $1,
          status = $2,
          expires_at = $3,
          payment_id = $4
      WHERE user_id = $5
        AND plan_id = $6
        AND created_at = $7
      `,
      [
        planId,
        status,
        expiresAt,
        paymentId,
        existing.rows[0].user_id,
        existing.rows[0].plan_id,
        existing.rows[0].created_at,
      ]
    );
    return;
  }

  await client.query(
    `
    INSERT INTO user_subscriptions (user_id, plan_id, status, expires_at, payment_id)
    VALUES ($1,$2,$3,$4,$5)
    `,
    [userId, planId, status, expiresAt, paymentId]
  );
}

async function applyBoostApproval(client, intent) {
  const boostDays = Number(intent.metadata?.boost_days || 0);
  if (!intent.ad_id || !boostDays) {
    return;
  }

  await client.query(
    `
    UPDATE ads
    SET
      highlight_until = CASE
        WHEN highlight_until IS NOT NULL AND highlight_until > NOW()
          THEN highlight_until + ($2 || ' days')::interval
        ELSE NOW() + ($2 || ' days')::interval
      END,
      priority = LEAST(99, COALESCE(priority, 1) + 8),
      updated_at = NOW()
    WHERE id = $1
      AND status != 'deleted'
    `,
    [intent.ad_id, String(boostDays)]
  );
}

export async function handleWebhookNotification({
  rawBody,
  signature,
  requestId,
  traceRequestId,
}) {
  const isValid = verifyWebhookSignature(rawBody, signature, requestId);
  if (!isValid) {
    logger.warn(
      {
        ...buildDomainFields({
          action: "payments.webhook.verify",
          result: "error",
          requestId: traceRequestId,
        }),
        reason: "invalid_signature",
      },
      "[payments] webhook assinatura inválida"
    );
    throw new AppError("invalid signature", 401);
  }

  const payload = rawBody ? JSON.parse(rawBody) : {};
  const resourceId = String(payload?.data?.id ?? "");
  if (!resourceId) {
    logger.info(
      {
        ...buildDomainFields({
          action: "payments.webhook",
          result: "success",
          requestId: traceRequestId,
        }),
        ignored: true,
      },
      "[payments] webhook sem resource id — ignorado"
    );
    return { ok: true, ignored: true };
  }

  const topic = payload.type === "preapproval" ? "preapproval" : "payment";
  const paymentData = await fetchPaymentStatus(resourceId, topic);
  const intent = await resolveIntentForWebhook(paymentData, resourceId);

  if (!intent) {
    logger.warn(
      {
        ...buildDomainFields({
          action: "payments.webhook.resolve_intent",
          result: "error",
          requestId: traceRequestId,
        }),
        resourceId,
      },
      "[payments] webhook intent não encontrado"
    );
    return { ok: true, warning: "payment intent not found" };
  }

  const mergedMetadata = {
    ...(intent.metadata || {}),
    ...(paymentData.metadata || {}),
  };

  await withTransaction(async (client) => {
    const lockedIntentResult = await client.query(
      `
      SELECT *
      FROM payment_intents
      WHERE id = $1
      FOR UPDATE
      `,
      [intent.id]
    );

    const lockedIntent = lockedIntentResult.rows[0] || intent;
    const alreadyApproved = lockedIntent.status === "approved";

    await client.query(
      `
      UPDATE payment_intents
      SET
        checkout_resource_id = COALESCE(checkout_resource_id, $2),
        payment_resource_id = COALESCE($3, payment_resource_id),
        status = $4,
        metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        intent.id,
        resourceId,
        paymentData.mercadoPagoId,
        paymentData.status,
        serializeMetadata(mergedMetadata),
      ]
    );

    if (lockedIntent.context === "plan" && lockedIntent.plan_id) {
      const plan = await getPlanById(lockedIntent.plan_id);
      if (!plan) {
        throw new AppError("Plano nao encontrado para confirmacao.", 404);
      }

      await upsertPlanPayment(client, lockedIntent, paymentData);

      const subscriptionStatus = resolveSubscriptionStatus(paymentData.status);
      const expiresAt =
        subscriptionStatus === "active" ? resolveExpiryDate(plan.validity_days) : null;

      if (subscriptionStatus === "active") {
        await client.query(
          `
          UPDATE user_subscriptions
          SET status = 'canceled',
              expires_at = NOW()
          WHERE user_id = $1
            AND payment_id IS DISTINCT FROM $2
            AND status IN ('active', 'pending')
          `,
          [lockedIntent.user_id, paymentData.mercadoPagoId]
        );
      }

      await upsertUserSubscription(client, {
        userId: lockedIntent.user_id,
        planId: lockedIntent.plan_id,
        paymentId: paymentData.mercadoPagoId,
        status: subscriptionStatus,
        expiresAt,
      });

      if (subscriptionStatus === "active") {
        await client.query(
          `
          UPDATE users
          SET plan = $2
          WHERE id = $1
          `,
          [lockedIntent.user_id, lockedIntent.plan_id]
        );
      } else if (subscriptionStatus === "canceled") {
        const activeSubscriptionResult = await client.query(
          `
          SELECT 1
          FROM user_subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > NOW())
          LIMIT 1
          `,
          [lockedIntent.user_id]
        );

        if (!activeSubscriptionResult.rows[0]) {
          await client.query(
            `
            UPDATE users
            SET plan = 'free'
            WHERE id = $1
            `,
            [lockedIntent.user_id]
          );
        }
      }
    }

    if (lockedIntent.context === "boost" && paymentData.status === "approved" && !alreadyApproved) {
      const boostIntent = {
        ...lockedIntent,
        metadata: mergedMetadata,
      };
      await applyBoostApproval(client, boostIntent);
    }
  });

  logger.info(
    {
      ...buildDomainFields({
        action: "payments.webhook.apply",
        result: "success",
        requestId: traceRequestId,
        userId: intent.user_id,
      }),
      paymentStatus: paymentData.status,
      context: intent.context,
      intentId: intent.id,
    },
    "[payments] webhook processado"
  );

  return {
    ok: true,
    context: intent.context === "boost" ? "ad_boost" : "plan",
    status: paymentData.status,
  };
}
