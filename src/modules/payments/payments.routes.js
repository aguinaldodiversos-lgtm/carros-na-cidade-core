import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  createBoostCheckout,
  createPlanCheckout,
  createPlanSubscription,
} from "./payments.service.js";
import { mercadoPagoWebhookController } from "./payments.webhook.controller.js";
import { getMyPaymentReturnStatus } from "./payments.return-status.service.js";
import {
  cancelUserSubscription,
  createSubscriptionCheckout,
  getMySubscription,
} from "./subscriptions.service.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function resolvePublicUrls() {
  // URLs de retorno são controladas pelo servidor, nunca pelo cliente ou header Host.
  const base =
    process.env.FRONTEND_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://www.carrosnacidade.com"
      : "http://localhost:3000");
  let origin;
  try {
    const url = new URL(base);
    if (
      process.env.NODE_ENV === "production" &&
      (url.protocol !== "https:" ||
        !["carrosnacidade.com", "www.carrosnacidade.com"].includes(url.hostname))
    ) {
      throw new Error("Domínio não autorizado");
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Origem inválida");
    }
    origin = url.origin;
  } catch {
    throw new AppError("Origem de retorno do pagamento não configurada corretamente.", 500);
  }
  return {
    successUrl: `${origin}/pagamento/sucesso`,
    failureUrl: `${origin}/pagamento/erro`,
    pendingUrl: `${origin}/pagamento/erro`,
  };
}

/** Estado do pagamento desta conta após o retorno do Mercado Pago.
 * Nunca utiliza o status recebido na URL como confirmação de cobrança.
 */
router.get(
  "/return-status",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const reference = String(req.query?.reference || "");
    const result = await getMyPaymentReturnStatus({
      userId: req.user.id,
      reference,
    });

    res.set("Cache-Control", "private, no-store");
    if (!result) {
      res.status(404).json({ error: "Pagamento não encontrado nesta conta." });
      return;
    }
    res.json(result);
  })
);

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
      requestId: req.requestId,
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

/**
 * Estado da assinatura do próprio usuário (READ-ONLY). Escopo pela sessão:
 * usa SÓ req.user.id do JWT — não aceita id de assinatura/usuário do cliente.
 * Retorna { status:'none' } quando não há assinatura (ex.: plano gratuito).
 */
router.get(
  "/subscriptions/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const payload = await getMySubscription({ userId: req.user.id });
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
 * Diferente de POST /create (que aceita um boost_option_id e valida
 * contra a lista autorizada), aqui o `boost_option_id` é FIXADO em
 * "boost-7d" no servidor — o cliente não escolhe nada. boost-7d é o
 * único produto de destaque autorizado hoje. Rota canônica usada pelo
 * checkout do frontend. Contrato auditável: "esta URL só vende boost-7d".
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
      // Hardcoded — esta rota só vende boost-7d (único produto autorizado).
      boostOptionId: "boost-7d",
      requestId: req.requestId,
      ...resolvePublicUrls(req),
    });

    res.json(payload);
  })
);

// ALIAS LEGADO — NÃO REMOVER.
// O caminho canônico do webhook é POST /webhook/mercadopago (montado na raiz
// em src/app.js, cadastrado no painel do MP). Este alias /api/payments/webhook
// precisa continuar existindo enquanto houver preferences ANTIGAS em
// circulação: elas carregam a notification_url anterior
// (`${backend}/api/payments/webhook`) embutida no recurso do Mercado Pago, e o
// MP vai notificar nesse caminho até esses pagamentos expirarem. Remover este
// alias faria essas notificações antigas baterem em 404. Mesmo handler do
// caminho canônico (mercadoPagoWebhookController).
router.post("/webhook", mercadoPagoWebhookController);

router.get("/webhook", (_req, res) => {
  res.json({ ok: true });
});

export default router;
