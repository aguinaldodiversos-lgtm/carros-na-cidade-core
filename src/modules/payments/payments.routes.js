import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  createBoostCheckout,
  createPlanCheckout,
  createPlanSubscription,
  handleWebhookNotification,
} from "./payments.service.js";
import {
  cancelUserSubscription,
  createSubscriptionCheckout,
} from "./subscriptions.service.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function resolvePublicUrls(req) {
  const origin = String(req.body?.success_url || "").trim()
    ? null
    : `${req.protocol}://${req.get("host")}`;

  const successUrl = String(req.body?.success_url || `${origin}/pagamento/sucesso`).trim();
  const failureUrl = String(req.body?.failure_url || `${origin}/pagamento/erro`).trim();
  const pendingUrl = String(req.body?.pending_url || `${origin}/pagamento/erro`).trim();

  return { successUrl, failureUrl, pendingUrl };
}

router.post(
  "/create",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const adId = String(req.body?.ad_id || "").trim();
    const boostOptionId = String(req.body?.boost_option_id || "").trim();
    const planId = String(req.body?.plan_id || "").trim();
    const urls = resolvePublicUrls(req);

    if (adId || boostOptionId) {
      if (!adId || !boostOptionId) {
        throw new AppError("ad_id e boost_option_id sao obrigatorios", 400);
      }

      const payload = await createBoostCheckout({
        userId: req.user.id,
        adId,
        boostOptionId,
        requestId: req.requestId,
        ...urls,
      });

      res.json(payload);
      return;
    }

    if (!planId) {
      throw new AppError("plan_id e obrigatorio", 400);
    }

    const payload = await createPlanCheckout({
      userId: req.user.id,
      planId,
      requestId: req.requestId,
      ...urls,
    });

    res.json(payload);
  })
);

router.post(
  "/subscription",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const planId = String(req.body?.plan_id || "").trim();
    if (!planId) {
      throw new AppError("plan_id e obrigatorio", 400);
    }

    const payload = await createPlanSubscription({
      userId: req.user.id,
      planId,
      ...resolvePublicUrls(req),
    });

    res.json(payload);
  })
);

/**
 * Rotas dedicadas de assinatura recorrente Start/Pro (Fase 3C).
 *
 * IMPORTANTE — não ativar publicamente nesta fase:
 *   - /planos NÃO chama estes endpoints (CTAs Start/Pro continuam em
 *     /anunciar?plano=X até validação ponta a ponta em sandbox).
 *   - Endpoints existem para que sandbox + admin possam testar o fluxo
 *     completo sem ainda expor pra usuário comum.
 *   - Em produção, MP_ACCESS_TOKEN sandbox nesta fase; PROD só após
 *     checklist do runbook docs/runbooks/mercado-pago-subscriptions-start-pro.md
 *
 * Diferenças do legacy POST /subscription:
 *   - Whitelist explícita: SÓ aceita cnpj-store-start ou cnpj-store-pro
 *     (legacy aceita qualquer plan_id com billing_model='monthly')
 *   - Bloqueia explicitamente cnpj-evento-premium e cpf-premium-highlight
 *   - Bloqueia criar 2ª assinatura quando user já tem uma viva
 *     (active/pending/paused)
 */
router.post(
  "/subscriptions/checkout",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const planId = String(req.body?.plan_id || "").trim();
    if (!planId) {
      throw new AppError("plan_id e obrigatorio", 400);
    }

    const payload = await createSubscriptionCheckout({
      userId: req.user.id,
      planId,
      requestId: req.requestId,
      ...resolvePublicUrls(req),
    });

    res.json(payload);
  })
);

router.post(
  "/subscriptions/cancel",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const payload = await cancelUserSubscription({
      userId: req.user.id,
      requestId: req.requestId,
    });
    res.json(payload);
  })
);

/**
 * Rota dedicada do Destaque 7 dias (Fase 3B).
 *
 * Diferente de POST /create (que aceita qualquer boost_option_id e
 * delega), aqui o `boost_option_id` é FIXADO em "boost-7d" no
 * servidor — o cliente não consegue trocar para boost-30d sem ir
 * no /create explicitamente. Reduz superfície de erro e dá um
 * contrato auditável claro: "esta URL só vende boost-7d".
 *
 * Preço (R$ 39,90) vem 100% do BOOST_OPTIONS no backend (via
 * `listBoostOptions()`), nunca do payload do cliente — defesa
 * anti-spoof já existente em `createBoostCheckout`.
 *
 * Body esperado: `{ ad_id: string }`
 * Resposta: `{ context: 'ad_boost', ad_id, boost_option_id: 'boost-7d',
 *              init_point, mercado_pago_id, public_key }`
 */
router.post(
  "/boost-7d/checkout",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const adId = String(req.body?.ad_id || "").trim();
    if (!adId) {
      throw new AppError("ad_id e obrigatorio", 400);
    }

    const payload = await createBoostCheckout({
      userId: req.user.id,
      adId,
      // Hardcoded — esta rota só vende boost-7d. Para boost-30d use /create.
      boostOptionId: "boost-7d",
      requestId: req.requestId,
      ...resolvePublicUrls(req),
    });

    res.json(payload);
  })
);

router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const payload = await handleWebhookNotification({
      rawBody: req.rawBody || JSON.stringify(req.body || {}),
      signature: req.headers["x-signature"] || null,
      requestId: req.headers["x-request-id"] || null,
      traceRequestId: req.requestId,
    });

    res.json(payload);
  })
);

router.get("/webhook", (_req, res) => {
  res.json({ ok: true });
});

export default router;
