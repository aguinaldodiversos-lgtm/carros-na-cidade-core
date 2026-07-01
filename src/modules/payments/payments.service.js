import crypto from "crypto";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { query, withTransaction } from "../../infrastructure/database/db.js";
import {
  getAccountUser,
  getOwnedAd,
  getPlanById,
  isEventPlanId,
} from "../account/account.service.js";
import { isEventsDomainEnabled } from "../../shared/config/features.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import {
  assertNoLiveSubscriptionFor,
  assertSubscribablePlan,
} from "./subscriptions.guards.js";
import { getBoostOptions, getCommercialRules } from "../commercial/commercial-rules.service.js";
import { resolveCheckoutExecution, assertSubscriptionsRealAllowed } from "./payments.gate.js";
import {
  classifyWebhookTopic,
  handleSubscriptionPreapprovalEvent,
  handleSubscriptionAuthorizedPaymentEvent,
} from "./subscriptions.webhook.js";

/**
 * Guard: bloqueia checkout/subscription para planos do produto Evento
 * (dormente). Aplicado em createPlanCheckout e createPlanSubscription.
 * Não afeta planos de loja (Start/Pro), planos CPF, nem boost de anúncio.
 *
 * Comportamento: se planId é evento E EVENTS_PAYMENTS_ENABLED não é
 * "true", lança AppError 410 antes de tocar Mercado Pago. Log de
 * tentativa fica em logger.warn para auditoria.
 */
function refuseEventPlanCheckout(planId, where) {
  if (!isEventPlanId(planId)) return;
  if (isEventsDomainEnabled("payments")) return;
  logger.warn(
    {
      domain: "events.shutdown",
      where,
      planId,
    },
    "[payments] tentativa de checkout para plano de Evento (dormente) — bloqueado"
  );
  throw new AppError(
    "Plano de Evento esta indisponivel no momento. Tente novamente mais tarde.",
    410
  );
}

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY || "";
const MP_WEBHOOK_SECRET = process.env.MP_WEBHOOK_SECRET;
const MP_API_BASE = "https://api.mercadopago.com";

// Em produção MP_WEBHOOK_SECRET é obrigatório: sem ele, verifyWebhookSignature
// retorna `true` para qualquer payload (ver função abaixo) — qualquer atacante
// poderia forjar webhooks aprovando planos e destaques. Falhar fast no boot
// evita esse modo bypass passar despercebido em deploys reais.
if (process.env.NODE_ENV === "production" && !MP_WEBHOOK_SECRET) {
  throw new Error(
    "MP_WEBHOOK_SECRET é obrigatório em NODE_ENV=production (anti-spoofing do webhook Mercado Pago)."
  );
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function getBackendPublicUrl() {
  // IMPORTANTE: esta é a URL pública DO BACKEND (onde o Mercado Pago entrega o
  // webhook), NÃO do frontend. Por isso NÃO usamos APP_BASE_URL — no .env.example
  // ela pertence ao grupo do frontend (FRONTEND_URL/SITE_URL = :3000), enquanto o
  // backend é API_URL/BACKEND_API_URL/NEXT_PUBLIC_API_URL (:4000). Usar APP_BASE_URL
  // fazia a notification_url apontar para o domínio do frontend, que não serve
  // /webhook/mercadopago — a notificação do pagamento real caía em 404.
  //
  // Precedência: override explícito → URL auto-injetada pelo Render (= domínio do
  // próprio serviço de backend) → vars de backend.
  const value =
    process.env.MP_WEBHOOK_BASE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "";

  if (!value) {
    throw new AppError("URL pública do backend não configurada para webhook.", 500);
  }

  return stripTrailingSlash(value);
}

/**
 * URL pública do FRONTEND (onde o usuário é redirecionado após o checkout),
 * NÃO do backend. Usada como `back_url` do preapproval (assinatura). O
 * Mercado Pago valida `back_url` de forma ESTRITA no endpoint /preapproval
 * (diferente do /checkout/preferences do boost, que é leniente): precisa ser
 * uma URL absoluta `https://`. Por isso aqui exigimos https público e
 * falhamos com mensagem clara se não houver — em vez de deixar o MP devolver
 * um 400 genérico ("Invalid value for back_url").
 *
 * Lê das mesmas envs de frontend já usadas no projeto (workers, SEO):
 * FRONTEND_URL → SITE_URL → NEXT_PUBLIC_SITE_URL → PUBLIC_SITE_URL.
 */
export function getFrontendPublicUrl() {
  const value =
    process.env.FRONTEND_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    "";

  const url = stripTrailingSlash(value);
  if (!/^https:\/\/[^/\s]+/i.test(url)) {
    throw new AppError(
      "URL pública do frontend (https) não configurada para back_url da assinatura. Defina FRONTEND_URL (ex.: https://carrosnacidade.com).",
      500
    );
  }
  return url;
}

/**
 * URL canônica do webhook do Mercado Pago (raiz do backend). Fonte única usada
 * tanto no corpo da preference/preapproval quanto no log de criação — assim o
 * log do Render reflete exatamente o que foi gravado no recurso do MP.
 */
function getWebhookNotificationUrl() {
  return `${getBackendPublicUrl()}/webhook/mercadopago`;
}

/**
 * Wrapper minimal do fetch contra a API do Mercado Pago. Exporta para
 * permitir reuso em camadas isoladas (ex: mercadopago-subscription.client.js
 * da Fase 3C). NÃO usar em código de domínio diretamente — chame via
 * client específico do recurso (preference, preapproval, payment).
 */
export async function mpRequest(path, init = {}) {
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
    const err = new AppError(`Mercado Pago error (${response.status}): ${body}`, 502);
    // Expõe o status HTTP do MP para o caller distinguir casos esperados
    // (ex.: 404 = recurso inexistente) de falhas reais. Ver handleWebhookNotification.
    err.upstreamStatus = response.status;
    throw err;
  }

  return response.json();
}

/**
 * Indica se o cliente MP está em modo MOCK (sem MP_ACCESS_TOKEN). Em modo
 * mock, clients devem retornar payloads sintéticos em vez de tocar a API
 * — evita teste local depender de credencial real.
 */
export function isMercadoPagoMockMode() {
  return !MP_ACCESS_TOKEN;
}

export function getMercadoPagoPublicKey() {
  return MP_PUBLIC_KEY;
}

export function getMercadoPagoBackendPublicUrl() {
  return getBackendPublicUrl();
}

function serializeMetadata(value) {
  return JSON.stringify(value || {});
}

async function insertPaymentIntent(intent) {
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

export function resolveSubscriptionStatus(paymentStatus) {
  if (paymentStatus === "approved") return "active";
  if (paymentStatus === "pending") return "pending";
  return "canceled";
}

export function resolveExpiryDate(validityDays) {
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
  refuseEventPlanCheckout(planId, "createPlanCheckout");

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

  // Fase 5.0 — gate unificado. Mock quando sem token; BLOQUEIA cobrança
  // real quando o token existe mas PAYMENTS_LIVE/sandbox está desligado.
  const execution = resolveCheckoutExecution({
    productType: "plan",
    userId: user.id,
    planId: plan.id,
    requestId,
  });

  if (execution.mode === "mock") {
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

  const notificationUrl = getWebhookNotificationUrl();
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
      notification_url: notificationUrl,
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
      notificationUrl,
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

export async function createPlanSubscription({ userId, planId, successUrl, requestId }) {
  // Evento (dormente) é bloqueado primeiro, com 410 anti-revival.
  refuseEventPlanCheckout(planId, "createPlanSubscription");

  // Defesa em profundidade: bloqueia 2ª assinatura viva do mesmo user.
  await assertNoLiveSubscriptionFor(userId);

  const [user, plan] = await Promise.all([getAccountUser(userId), getPlanById(planId)]);

  // Elegibilidade DATA-DRIVEN (sem whitelist fixa): plano existe + is_active +
  // subscribable + mensal. Criar plano novo assinável não exige tocar código.
  // Ver src/modules/payments/subscriptions.guards.js e
  // tests/payments/subscriptions-bypass-audit.test.js.
  assertSubscribablePlan(plan);

  if (Number(plan.price) <= 0) {
    throw new AppError("Plano de assinatura precisa de preco maior que zero.", 400);
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

  // Fase 5.0 — gate unificado (mesmo do destaque). Mock sem token; bloqueia
  // cobrança real sem PAYMENTS_LIVE/sandbox.
  const execution = resolveCheckoutExecution({
    productType: "subscription",
    userId: user.id,
    planId: plan.id,
    requestId,
  });

  if (execution.mode === "mock") {
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

  // Fase 5.0 — assinatura recorrente real exige cadeado ADICIONAL
  // (subordinado a PAYMENTS_LIVE). Cobre tanto o endpoint legacy
  // /subscription quanto /subscriptions/checkout (ambos passam por aqui).
  assertSubscriptionsRealAllowed({
    mode: execution.mode,
    userId: user.id,
    planId: plan.id,
    requestId,
  });

  const notificationUrl = getWebhookNotificationUrl();
  // back_url do preapproval: o MP valida estritamente (precisa ser https
  // pública absoluta). NÃO usamos `successUrl` (derivado do origin do request,
  // que pode ser http/localhost/origin interno) — montamos a partir da URL
  // pública do frontend. Boost (preference) permanece intocado.
  //
  // Observabilidade: qualquer falha aqui (FRONTEND_URL ausente ou erro do MP)
  // é logada em level error com a causa real + requestId ANTES de propagar —
  // evita 502/500 mudo no caminho da assinatura. Não altera status/lógica:
  // o erro é re-lançado para o errorHandler/rota tratarem como antes.
  let backUrl;
  try {
    backUrl = `${getFrontendPublicUrl()}/pagamento/sucesso`;
  } catch (err) {
    logger.error(
      {
        ...buildDomainFields({
          action: "payments.checkout.subscription",
          result: "error",
          requestId,
          userId: user.id,
        }),
        planId: plan.id,
        reason: "back_url_unresolved",
        err: err?.message,
      },
      "[payments] back_url da assinatura falhou: FRONTEND_URL ausente/inválida"
    );
    throw err;
  }

  let preapproval;
  try {
    preapproval = await mpRequest("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: plan.name,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: Number(Number(plan.price).toFixed(2)),
          currency_id: "BRL",
        },
        back_url: backUrl,
        status: "pending",
        payer_email: user.email || `${user.id}@carrosnacidade.local`,
        notification_url: notificationUrl,
        metadata,
      }),
    });
  } catch (err) {
    logger.error(
      {
        ...buildDomainFields({
          action: "payments.checkout.subscription",
          result: "error",
          requestId,
          userId: user.id,
        }),
        planId: plan.id,
        reason: "preapproval_create_failed",
        upstreamStatus: err?.upstreamStatus ?? null,
        err: err?.message,
      },
      "[payments] criação do preapproval falhou no Mercado Pago"
    );
    throw err;
  }

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
      notificationUrl,
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
  const [user, ad, boostOptions, rules] = await Promise.all([
    getAccountUser(userId),
    getOwnedAd(userId, adId),
    getBoostOptions(),
    getCommercialRules(),
  ]);

  // Fase 2.1 — boost options canônicos vêm de platform_settings (boost-7d),
  // único produto autorizado. Validamos o id contra essa lista: ids não
  // configurados (ex.: boost-30d removido) caem em "opção inválida" abaixo.
  const boostOption = boostOptions.find((option) => option.id === boostOptionId);
  if (!boostOption) {
    throw new AppError("Opcao de impulsionamento invalida.", 400);
  }

  // Fase 2.1 — allowlist por tipo de documento (CPF/CNPJ).
  // 'pending' (sem documento) NUNCA pode comprar destaque — sempre bloqueado.
  // Quem já é admin não passa por aqui (rota é de usuário final).
  if (user.type === "pending") {
    throw new AppError("Verifique seu CPF ou CNPJ antes de comprar destaque.", 400, true, {
      code: "BOOST_REQUIRES_VERIFIED_DOCUMENT",
    });
  }
  if (user.type === "CPF" && !rules.allow_boost_cpf) {
    throw new AppError("Compra de destaque por CPF esta desabilitada no momento.", 403, true, {
      code: "BOOST_BLOCKED_FOR_CPF",
    });
  }
  if (user.type === "CNPJ" && !rules.allow_boost_cnpj) {
    throw new AppError("Compra de destaque por CNPJ esta desabilitada no momento.", 403, true, {
      code: "BOOST_BLOCKED_FOR_CNPJ",
    });
  }

  // Tarefa 9 — destaque só pode ser comprado para anúncios ACTIVE.
  // PENDING_REVIEW / REJECTED / PAUSED / SOLD / EXPIRED / DELETED nunca
  // entram no checkout. O webhook (applyBoostApproval) também revalida.
  if (String(ad.status) !== "active") {
    throw new AppError("Este anúncio precisa estar ativo para receber destaque.", 400, true, {
      code: "BOOST_REQUIRES_ACTIVE_STATUS",
      currentStatus: ad.status,
    });
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

  // Fase 5.0 — fix do R1: o destaque (boost-7d) agora respeita o MESMO
  // gate da assinatura. Token presente sem PAYMENTS_LIVE/sandbox NÃO cobra
  // mais — bloqueia com erro claro. Sem token segue mockando.
  const execution = resolveCheckoutExecution({
    productType: "boost",
    userId: user.id,
    adId: ad.id,
    requestId,
  });

  if (execution.mode === "mock") {
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

  const notificationUrl = getWebhookNotificationUrl();
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
          // Identificação do vendedor/produto no checkout do Mercado Pago.
          // O nome da APLICAÇÃO MP (ex.: cabeçalho do checkout) vem das
          // credenciais externas, não do código — ver runbook. Aqui
          // garantimos que o item identifique Carros na Cidade.
          title: `Carros na Cidade - Destaque ${boostOption.days} dias`,
          description: `Impulsionar anuncio: ${ad.title}`,
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
      notification_url: notificationUrl,
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
      notificationUrl,
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

/**
 * Comparação de hashes hex em tempo constante (anti timing-attack).
 * Retorna false (sem lançar) quando os tamanhos diferem ou a entrada é
 * inválida — `crypto.timingSafeEqual` exige buffers de mesmo tamanho.
 */
function timingSafeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(String(a), "hex");
    const bufB = Buffer.from(String(b), "hex");
    if (bufA.length === 0 || bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Extrai `data.id` do corpo cru do webhook. Usado APENAS como fallback quando
 * a query string (?data.id=...) vem vazia — o Mercado Pago assina o `data.id`
 * da query, então essa é a fonte preferencial (ver mercadoPagoWebhookController).
 */
function payloadDataIdFromRaw(rawBody) {
  try {
    const parsed = rawBody ? JSON.parse(rawBody) : {};
    return parsed?.data?.id != null ? String(parsed.data.id) : null;
  } catch {
    return null;
  }
}

/**
 * Verifica a assinatura HMAC do webhook do Mercado Pago conforme a spec
 * oficial: o manifesto é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (data.id em lowercase), com HMAC-SHA256 sobre o manifesto SEM o corpo da
 * requisição. O segredo vem exclusivamente de process.env.MP_WEBHOOK_SECRET
 * (nunca hardcoded, nunca logado) e a comparação é tempo-constante.
 */
export function verifyWebhookSignature(signatureHeader, requestIdHeader, dataId) {
  if (!MP_WEBHOOK_SECRET) {
    return true;
  }
  if (!signatureHeader || !requestIdHeader || !dataId) {
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
  // Spec MP: id = data.id (lowercase se alfanumérico), request-id = header,
  // ts = timestamp da própria assinatura. O corpo NÃO entra no HMAC.
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestIdHeader};ts:${ts};`;
  const expected = crypto.createHmac("sha256", MP_WEBHOOK_SECRET).update(manifest).digest("hex");

  return timingSafeEqualHex(expected, v1);
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
    [intent.user_id, intent.plan_id, paymentId, paymentData.status, amount, paymentData.paymentType]
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

/**
 * Aplica aprovação de boost num anúncio. Idempotência efetiva é garantida
 * pelo caller (`handleWebhookNotification` faz `FOR UPDATE` no intent +
 * checa `intent.status === 'approved'` antes de chamar; `payment_intents.
 * payment_resource_id UNIQUE` evita registrar 2x o mesmo payment).
 *
 * Regra de prazo (alinhada à oferta oficial do Destaque 7 dias —
 * "compras duplicadas estendem prazo, não aumentam prioridade"):
 *
 *   - Se `highlight_until > NOW()` (ainda ativo): SOMA `+boost_days`
 *     ao valor existente — extensão real do prazo.
 *   - Se `highlight_until IS NULL` ou está no passado: define
 *     `NOW() + boost_days` — começa do zero.
 *
 * Defesa em profundidade (revalidação do vínculo dono↔ad↔intent):
 *   - Sem `ad_id` ou `boost_days=0`: no-op (early return).
 *   - O UPDATE só passa quando:
 *       1. `ads.id = intent.ad_id`
 *       2. `ads.status != 'deleted'`
 *       3. `advertisers.user_id = intent.user_id`  (pagador continua dono)
 *     Se algum desses falhar (ad transferido, removido ou pagador trocou
 *     de conta entre o checkout e a confirmação MP), o webhook é loggado
 *     como rejeitado de segurança e `highlight_until` permanece intacto.
 *   - O service de checkout (`createBoostCheckout`) já valida ownership
 *     via `getOwnedAd`; esta camada existe para pegar mudanças que
 *     ocorrerem ENTRE o início do checkout e a confirmação assíncrona.
 *
 * Exportado para teste (validar shape do SQL + params + early return).
 * Não chamar diretamente fora do webhook — a idempotência depende do
 * lock + check de status do caller.
 */
export async function applyBoostApproval(client, intent) {
  const boostDays = Number(intent.metadata?.boost_days || 0);
  if (!intent.ad_id || !boostDays) {
    return { applied: false, reason: "missing_ad_or_days" };
  }

  // Revalidação síncrona do vínculo: ad existe, não está deleted,
  // ainda pertence ao usuário que iniciou o pagamento.
  const ownerCheck = await client.query(
    `
    SELECT a.id, a.status, adv.user_id AS advertiser_user_id
    FROM ads a
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [intent.ad_id]
  );

  const owner = ownerCheck.rows[0] || null;

  if (!owner) {
    logger.warn(
      {
        ...buildDomainFields({ action: "payments.webhook.boost.reject", result: "error" }),
        intentId: intent.id,
        adId: intent.ad_id,
        reason: "ad_not_found",
      },
      "[payments] boost rejeitado: anúncio inexistente"
    );
    return { applied: false, reason: "ad_not_found" };
  }

  if (String(owner.status) === "deleted") {
    logger.warn(
      {
        ...buildDomainFields({ action: "payments.webhook.boost.reject", result: "error" }),
        intentId: intent.id,
        adId: intent.ad_id,
        reason: "ad_deleted",
      },
      "[payments] boost rejeitado: anúncio deletado"
    );
    return { applied: false, reason: "ad_deleted" };
  }

  // Tarefa 9 — somente ACTIVE pode receber destaque. Bloqueia
  // PENDING_REVIEW / REJECTED / PAUSED / SOLD / EXPIRED / BLOCKED
  // mesmo que o checkout tenha sido aprovado pelo MP.
  if (String(owner.status) !== "active") {
    logger.warn(
      {
        ...buildDomainFields({ action: "payments.webhook.boost.reject", result: "error" }),
        intentId: intent.id,
        adId: intent.ad_id,
        reason: "boost_blocked_due_to_status",
        currentStatus: owner.status,
      },
      "[payments] boost rejeitado: anúncio fora de ACTIVE"
    );
    // Audit em ad_moderation_events (defesa em profundidade — segura caso
    // outro caller execute applyBoostApproval direto). Falhas de log não
    // alteram o resultado.
    try {
      await client.query(
        `
        INSERT INTO ad_moderation_events
          (ad_id, event_type, actor_user_id, actor_role, from_status, to_status, reason, metadata)
        VALUES ($1, 'boost_blocked_due_to_status', $2, 'system', $3, $3, $4, $5::jsonb)
        `,
        [
          intent.ad_id,
          intent.user_id != null ? String(intent.user_id) : null,
          owner.status,
          "Boost approval skipped: ad is not ACTIVE.",
          JSON.stringify({ intentId: intent.id }),
        ]
      );
    } catch {
      /* tabela pode não existir em ambientes legados — não falhar webhook */
    }
    return { applied: false, reason: "boost_blocked_due_to_status" };
  }

  if (String(owner.advertiser_user_id) !== String(intent.user_id)) {
    logger.warn(
      {
        ...buildDomainFields({ action: "payments.webhook.boost.reject", result: "error" }),
        intentId: intent.id,
        adId: intent.ad_id,
        reason: "ownership_mismatch",
        purchaserUserId: String(intent.user_id),
        currentOwnerUserId: String(owner.advertiser_user_id),
      },
      "[payments] boost rejeitado: pagador não é mais dono do anúncio"
    );
    return { applied: false, reason: "ownership_mismatch" };
  }

  // Fase 3.3: boost mexe APENAS em highlight_until. O ranking comercial
  // detecta destaque ativo via `highlight_until > NOW()` em commercialLayerExpr
  // (ads-ranking.sql.js) — anúncio entra na camada 4 automaticamente sem
  // depender de priority. Somar 8 em priority distorcia o tiebreaker do
  // hybrid_score e gerou valores inconsistentes (ex: #82 com priority=9).
  await client.query(
    `
    UPDATE ads
    SET
      highlight_until = CASE
        WHEN highlight_until IS NOT NULL AND highlight_until > NOW()
          THEN highlight_until + ($2 || ' days')::interval
        ELSE NOW() + ($2 || ' days')::interval
      END,
      updated_at = NOW()
    WHERE id = $1
      AND status != 'deleted'
    `,
    [intent.ad_id, String(boostDays)]
  );

  return { applied: true };
}

export async function handleWebhookNotification({
  rawBody,
  signature,
  requestId,
  dataId,
  traceRequestId,
  topicHint = null,
}) {
  const payload = rawBody ? JSON.parse(rawBody) : {};
  const topic = classifyWebhookTopic(topicHint || payload.type || payload.topic);

  // Tópicos irrelevantes (merchant_order, feed v2.0, etc.): ACK 200 e ignora.
  // Classificado ANTES da assinatura — não acionamos nada, então não há 401.
  if (topic === "other") {
    logger.info(
      {
        ...buildDomainFields({
          action: "payments.webhook.ignore_topic",
          result: "success",
          requestId: traceRequestId,
        }),
        topic: String(topicHint || payload.type || payload.topic || "").toLowerCase() || null,
        ignored: true,
      },
      "[payments] webhook tópico irrelevante — ACK 200 e ignorado"
    );
    return { ok: true, ignored: true, reason: "irrelevant_topic" };
  }

  // Tópicos acionáveis (payment avulso + assinatura) exigem assinatura válida.
  const isValid = verifyWebhookSignature(
    signature,
    requestId,
    dataId || payloadDataIdFromRaw(rawBody)
  );
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

  const resourceId = String(payload?.data?.id ?? dataId ?? "");
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

  // ── Assinatura (Fase 1: detectar + logar, SEM mutação) ──
  if (topic === "subscription_preapproval") {
    return handleSubscriptionPreapprovalEvent({ preapprovalId: resourceId, traceRequestId });
  }
  if (topic === "subscription_authorized_payment") {
    return handleSubscriptionAuthorizedPaymentEvent({
      authorizedPaymentId: resourceId,
      traceRequestId,
    });
  }

  // ── Pagamento avulso (destaque/boost) + plano one_time: PRODUÇÃO, INALTERADO ──
  let paymentData;
  try {
    paymentData = await fetchPaymentStatus(resourceId, "payment");
  } catch (err) {
    // 404 do MP = recurso (pagamento/preapproval) não existe. Acontece com o
    // simulador (data.id=123456) e com notificações órfãs. NÃO é erro fatal:
    // loga e responde 200 para o MP não reenviar. Outros status sobem normal.
    if (err?.upstreamStatus === 404) {
      logger.info(
        {
          ...buildDomainFields({
            action: "payments.webhook",
            result: "success",
            requestId: traceRequestId,
          }),
          resourceId,
          ignored: true,
        },
        `[payments] pagamento não encontrado, ignorando id=${resourceId}`
      );
      return { ok: true, ignored: true, reason: "payment_not_found" };
    }
    throw err;
  }

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
          SET plan_id = $2
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
          // Sem assinatura ativa: rebaixa para o gratuito correspondente ao
          // tipo de documento (CPF -> cpf-free-essential, CNPJ -> cnpj-free-store).
          await client.query(
            `
            UPDATE users
            SET plan_id = CASE
              WHEN UPPER(COALESCE(document_type, '')) = 'CNPJ' THEN 'cnpj-free-store'
              ELSE 'cpf-free-essential'
            END
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
