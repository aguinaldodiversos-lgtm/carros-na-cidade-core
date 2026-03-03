import express from "express";
import * as adsService from "./ads.service.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const router = express.Router();

/* =====================================================
   UTILITÁRIO SEGURO PARA NÚMEROS
===================================================== */

function toNumber(value) {
  const n = Number(value);
  return isNaN(n) ? undefined : n;
}

/* =====================================================
   ROTAS PÚBLICAS
===================================================== */

/**
 * GET /api/ads
 * Listagem padrão paginada
 */
router.get("/", async (req, res, next) => {
  try {
    const filters = {
      city_id: toNumber(req.query.city_id),
      brand: req.query.brand,
      min_price: toNumber(req.query.min_price),
      max_price: toNumber(req.query.max_price),
      page: toNumber(req.query.page) || 1,
      limit: toNumber(req.query.limit) || 20
    };

    const result = await adsService.search(filters);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ads/search
 * Busca full-text profissional
 * Query params:
 *   q
 *   city_id
 *   brand
 *   min_price
 *   max_price
 *   page
 *   limit
 */
router.get("/search", async (req, res, next) => {
  try {
    const filters = {
      q: req.query.q,
      city_id: toNumber(req.query.city_id),
      brand: req.query.brand,
      min_price: toNumber(req.query.min_price),
      max_price: toNumber(req.query.max_price),
      page: toNumber(req.query.page) || 1,
      limit: toNumber(req.query.limit) || 20
    };

    const result = await adsService.search(filters);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ads/:identifier
 * Pode buscar por ID ou SLUG
 */
router.get("/:identifier", async (req, res, next) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      throw new AppError("Identificador inválido", 400);
    }

    const ad = await adsService.show(identifier);

    res.json({
      success: true,
      data: ad
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   ROTAS AUTENTICADAS
===================================================== */

/**
 * POST /api/ads
 * Criar novo anúncio
 */
router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const requiredFields = [
      "title",
      "price",
      "city_id",
      "brand",
      "model",
      "year",
      "mileage",
      "city",
      "state"
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        throw new AppError(`Campo obrigatório: ${field}`, 400);
      }
    }

    const ad = await adsService.create(req.body, req.user);

    res.status(201).json({
      success: true,
      data: ad
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/ads/:id
 * Soft delete
 */
router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    const id = toNumber(req.params.id);

    if (!id) {
      throw new AppError("ID inválido", 400);
    }

    await adsService.remove(id, req.user);

    res.json({
      success: true,
      message: "Anúncio removido com sucesso"
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   EXPORT
===================================================== */

export default router;
