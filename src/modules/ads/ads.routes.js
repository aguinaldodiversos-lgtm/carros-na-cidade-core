// src/modules/ads/ads.routes.js

import express from "express";

import * as adsController from "./ads.controller.js";

import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { requirePlan } from "../../shared/middlewares/plan.middleware.js";
import { validate } from "../../shared/middlewares/validate.middleware.js";

import {
  createAdSchema,
  updateAdSchema,
} from "./ads.validator.js";

const router = express.Router();

/* =====================================================
   ROTAS PÚBLICAS
===================================================== */

// Listar anúncios (público)
router.get("/", adsController.list);

// Ver anúncio por ID (público)
router.get("/:id", adsController.show);

/* =====================================================
   ROTAS AUTENTICADAS
===================================================== */

// Criar anúncio (usuário autenticado)
router.post(
  "/",
  authMiddleware(),
  validate(createAdSchema),
  adsController.create
);

// Atualizar anúncio (usuário autenticado)
router.put(
  "/:id",
  authMiddleware(),
  validate(updateAdSchema),
  adsController.update
);

// Excluir anúncio
router.delete(
  "/:id",
  authMiddleware(),
  adsController.remove
);

/* =====================================================
   FUNCIONALIDADES PREMIUM
===================================================== */

// Destacar anúncio (somente plano PRO)
router.post(
  "/:id/highlight",
  authMiddleware(),
  requirePlan("pro"),
  adsController.highlight
);

// Gerar análise de preço (plano START ou PRO)
router.post(
  "/:id/price-analysis",
  authMiddleware(),
  requirePlan("start"),
  adsController.priceAnalysis
);

// Melhorar descrição com IA (somente PRO)
router.post(
  "/:id/ai-improve",
  authMiddleware(),
  requirePlan("pro"),
  adsController.aiImprove
);

export default router;

