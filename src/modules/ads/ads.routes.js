import express from "express";
import * as adsService from "./ads.service.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const router = express.Router();

/* =====================================================
   ROTAS PÚBLICAS
===================================================== */

/**
 * GET /api/ads
 * Listar anúncios com filtros opcionais
 * Query params:
 *  - city_id
 *  - brand
 *  - min_price
 *  - max_price
 */
router.get("/", async (req, res, next) => {
  try {
    const filters = {
      city_id: req.query.city_id
        ? Number(req.query.city_id)
        : undefined,
      brand: req.query.brand || undefined,
      min_price: req.query.min_price
        ? Number(req.query.min_price)
        : undefined,
      max_price: req.query.max_price
        ? Number(req.query.max_price)
        : undefined,
    };

    const ads = await adsService.list(filters);

    res.json({
      success: true,
      data: ads,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ads/:id
 * Detalhe do anúncio
 */
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      throw new AppError("ID inválido", 400);
    }

    const ad = await adsService.show(id);

    res.json({
      success: true,
      data: ad,
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
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        throw new AppError(`Campo obrigatório: ${field}`, 400);
      }
    }

    const ad = await adsService.create(req.body, req.user);

    res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   EXPORT
===================================================== */

export default router;
