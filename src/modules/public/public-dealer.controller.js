// src/modules/public/public-dealer.controller.js
import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as service from "./public-dealer.service.js";

/**
 * GET /api/public/dealers/:slug
 *
 * Resposta:
 *   200 → { success: true, data: { dealer: {...}, ads: [...] } }
 *   404 → loja inexistente OU `status != 'active'`
 *
 * Sem paginação na primeira versão — `ADS_PER_DEALER=60` cap no service.
 * Quando precisarmos, querystring `?page=N&limit=M` entra aqui.
 */
export async function getPublicDealerBySlug(req, res, next) {
  try {
    const data = await service.getPublicDealerBySlug(req.params.slug);
    if (!data) {
      throw new AppError("Loja não encontrada", 404);
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
