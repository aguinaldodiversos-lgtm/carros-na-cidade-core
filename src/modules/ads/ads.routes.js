import { pool } from "../../infrastructure/database/db.js";
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
   AUTOCOMPLETE INTELIGENTE
   GET /api/ads/autocomplete?q=...
===================================================== */

router.get("/autocomplete", async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    const queryText = q.trim();

    const result = await pool.query(
      `
      SELECT
        brand,
        model,
        city,
        COUNT(*) as total,
        ts_rank(search_vector, plainto_tsquery('portuguese', $1)) AS rank
      FROM ads
      WHERE
        status = 'active'
        AND search_vector @@ plainto_tsquery('portuguese', $1)
      GROUP BY brand, model, city, search_vector
      ORDER BY
        rank DESC,
        total DESC
      LIMIT 8
      `,
      [queryText]
    );

    const suggestions = result.rows.map(row => ({
      label: `${row.brand} ${row.model} - ${row.city}`,
      brand: row.brand,
      model: row.model,
      city: row.city,
      total: Number(row.total)
    }));

    res.json({
      success: true,
      suggestions
    });

  } catch (err) {
    next(err);
  }
});
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
