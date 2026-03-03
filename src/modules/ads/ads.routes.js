import express from "express";
import { pool } from "../../infrastructure/database/db.js";
import * as adsService from "./ads.service.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { cacheGet, cacheInvalidatePrefix } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

/* =====================================================
   UTILITÁRIOS
===================================================== */

function toNumber(value) {
  const n = Number(value);
  return isNaN(n) ? undefined : n;
}

function sanitizeString(value) {
  if (!value) return undefined;
  return String(value).trim();
}

/* =====================================================
   AUTOCOMPLETE INTELIGENTE
   GET /api/ads/autocomplete?q=...
===================================================== */

router.get(
  "/autocomplete",
  cacheGet({ prefix: "ads:auto", ttlSeconds: 20, varyBy: ["query"] }),
  async (req, res, next) => {
    try {
      const q = sanitizeString(req.query.q);

      if (!q || q.length < 2) {
        return res.json({ success: true, suggestions: [] });
      }

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
        ORDER BY rank DESC, total DESC
        LIMIT 8
        `,
        [q]
      );

      const suggestions = result.rows.map((row) => ({
        label: `${row.brand} ${row.model} - ${row.city}`,
        brand: row.brand,
        model: row.model,
        city: row.city,
        total: Number(row.total),
      }));

      res.json({ success: true, suggestions });
    } catch (err) {
      next(err);
    }
  }
);

/* =====================================================
   LISTAGEM PADRÃO
===================================================== */

router.get(
  "/",
  cacheGet({ prefix: "ads:list", ttlSeconds: 30, varyBy: ["query"] }),
  async (req, res, next) => {
    try {
      const filters = {
        city_id: toNumber(req.query.city_id),
        brand: sanitizeString(req.query.brand),
        model: sanitizeString(req.query.model),
        min_price: toNumber(req.query.min_price),
        max_price: toNumber(req.query.max_price),
        below_fipe: req.query.below_fipe,
        page: toNumber(req.query.page) || 1,
        limit: toNumber(req.query.limit) || 20,
      };

      const result = await adsService.search(filters);

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* =====================================================
   BUSCA FULL-TEXT
===================================================== */

router.get(
  "/search",
  cacheGet({ prefix: "ads:search", ttlSeconds: 30, varyBy: ["query"] }),
  async (req, res, next) => {
    try {
      const filters = {
        q: sanitizeString(req.query.q),
        city_id: toNumber(req.query.city_id),
        brand: sanitizeString(req.query.brand),
        model: sanitizeString(req.query.model),
        min_price: toNumber(req.query.min_price),
        max_price: toNumber(req.query.max_price),
        year_min: toNumber(req.query.year_min),
        year_max: toNumber(req.query.year_max),
        body_type: sanitizeString(req.query.body_type),
        fuel_type: sanitizeString(req.query.fuel_type),
        page: toNumber(req.query.page) || 1,
        limit: toNumber(req.query.limit) || 20,
      };

      const result = await adsService.search(filters);

      res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* =====================================================
   DETALHE POR ID OU SLUG
===================================================== */

router.get("/:identifier", async (req, res, next) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      throw new AppError("Identificador inválido", 400);
    }

    const ad = await adsService.show(identifier);

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   CRIAR ANÚNCIO
===================================================== */

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
      "state",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        throw new AppError(`Campo obrigatório: ${field}`, 400);
      }
    }

    const ad = await adsService.create(req.body, req.user);

    // Invalida cache
    await cacheInvalidatePrefix("home");
    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");

    res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   ATUALIZAR ANÚNCIO
===================================================== */

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    const id = toNumber(req.params.id);

    if (!id) {
      throw new AppError("ID inválido", 400);
    }

    const ad = await adsService.update(id, req.body, req.user);

    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   REMOVER (SOFT DELETE)
===================================================== */

router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    const id = toNumber(req.params.id);

    if (!id) {
      throw new AppError("ID inválido", 400);
    }

    await adsService.remove(id, req.user);

    await cacheInvalidatePrefix("home");
    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");

    res.json({
      success: true,
      message: "Anúncio removido com sucesso",
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   EXPORT
===================================================== */

export default router;
