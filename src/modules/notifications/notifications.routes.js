// Rotas do USUÁRIO logado sobre a própria caixa postal. Montadas em
// /api/account/notifications (app.js), ANTES do router /api/account — mesmo
// motivo pelo qual /api/public/seo vem antes de /api/public: prefixo mais
// específico primeiro.
//
// `authMiddleware` obrigatório e NADA além dele. Especificamente NÃO usa
// `requireDealerAccount`: notificação pertence a qualquer conta autenticada —
// CPF, CNPJ e pending. Restringir a lojista aqui esconderia do comprador do
// Produto A justamente as notificações endereçadas a ele.
//
// Não há rota de criação: ver notifications.controller.js.

import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import * as controller from "./notifications.controller.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(authMiddleware);

// Página de notificações do próprio usuário (limit/cursor na query).
router.get("/", asyncHandler(controller.listNotifications));

// Contador de não lidas — resposta mínima para o badge do sino.
//
// Declarado ANTES de qualquer rota com parâmetro para que "unread-count" nunca
// possa ser lido como um :id. Hoje não haveria colisão (o parser de id exige
// dígitos), mas a ordem certa é de graça e não depende dessa validação
// continuar existindo.
router.get("/unread-count", asyncHandler(controller.getUnreadCount));

// Marcar TODAS como lidas. Também antes da rota com :id, pelo mesmo motivo:
// "read-all" não pode competir com um identificador.
router.patch("/read-all", asyncHandler(controller.markAllAsRead));

// Marcar UMA como lida. Posse garantida no WHERE do UPDATE (ver repository).
router.patch("/:id/read", asyncHandler(controller.markAsRead));

export default router;
