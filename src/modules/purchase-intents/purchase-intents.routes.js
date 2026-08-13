// Rotas do COMPRADOR (PF). Montadas em `/api/account/purchase-intents`.
//
// Guarda: `authMiddleware` e nada mais. Deliberadamente SEM
// `requireDealerAccount` — quem publica procura é conta CPF ou `pending`, e o
// guard de lojista recusaria exatamente o público-alvo. A regra inversa
// (CNPJ NÃO publica por aqui) vive no service, porque é regra de produto e não
// de autorização de área: a mensagem precisa dizer ao lojista para onde ir.

import express from "express";

import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import * as controller from "./purchase-intents.controller.js";
import { purchaseIntentCreateRateLimit } from "./purchase-intents.rate-limit.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(authMiddleware);

router.get("/", asyncHandler(controller.listMyPurchaseIntents));

// O limitador vem DEPOIS do `authMiddleware` (montado acima) para que
// `req.user.id` já exista quando a chave for calculada.
router.post("/", purchaseIntentCreateRateLimit, asyncHandler(controller.createPurchaseIntent));

router.get("/:id", asyncHandler(controller.getMyPurchaseIntent));

// Fase 3 — veículos que as lojas enviaram para ESTA procura. Somente leitura: o
// comprador recebe, não envia. A posse vive na própria query (JOIN em
// purchase_intents com buyer_user_id), então procura de outra pessoa é 404.
//
// Continua respondendo com procura encerrada ou vencida: o que o comprador já
// recebeu é histórico dele. Quem para de aceitar veículo novo é o POST do
// lojista, não esta leitura.
router.get("/:id/offers", asyncHandler(controller.listReceivedOffers));

// PATCH e não DELETE: encerrar é mudança de estado, não remoção. A procura
// continua no histórico do comprador como "Encerrada".
router.patch("/:id/close", asyncHandler(controller.closeMyPurchaseIntent));

export default router;
