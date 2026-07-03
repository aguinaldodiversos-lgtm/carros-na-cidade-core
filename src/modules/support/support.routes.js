// Rotas do USUÁRIO logado (montadas em /api/support no app.js). authMiddleware
// obrigatório: o autor é sempre req.user.id. Espelha o estilo do módulo
// account (asyncHandler + router.use(authMiddleware)).

import express from "express";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import * as service from "./support.service.js";
import { supportCreateRateLimit } from "./support.rate-limit.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(authMiddleware);

// Cria chamado (assunto + categoria? + 1ª mensagem). Rate-limited por usuário.
router.post(
  "/tickets",
  supportCreateRateLimit,
  asyncHandler(async (req, res) => {
    const result = await service.createTicket(req.user.id, req.body || {});
    res.status(201).json({ success: true, ...result });
  })
);

// Lista só os chamados do próprio usuário.
router.get(
  "/tickets",
  asyncHandler(async (req, res) => {
    const tickets = await service.listMyTickets(req.user.id);
    res.json({ success: true, tickets });
  })
);

// Chamado + thread (valida posse; 404 se não for do usuário).
router.get(
  "/tickets/:id",
  asyncHandler(async (req, res) => {
    const result = await service.getMyTicket(req.user.id, req.params.id);
    res.json({ success: true, ...result });
  })
);

// Resposta do usuário (reabre se estava resolvido).
router.post(
  "/tickets/:id/messages",
  asyncHandler(async (req, res) => {
    const result = await service.replyToMyTicket(req.user.id, req.params.id, req.body || {});
    res.status(201).json({ success: true, ...result });
  })
);

export default router;
