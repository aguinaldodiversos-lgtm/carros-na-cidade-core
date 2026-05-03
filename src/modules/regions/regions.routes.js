import express from "express";
import { cacheGet } from "../../shared/cache/cache.middleware.js";
import { requireInternalToken } from "./regions.middleware.js";
import { getRegionByBaseSlug } from "./regions.service.js";

/**
 * Rotas internas do recurso "região aproximada".
 *
 * NÃO é exposto em sitemap, NÃO aparece em /api/public, e exige
 * X-Internal-Token (qualquer chamada sem o header correto recebe 404 — ver
 * regions.middleware.js). Hoje serve apenas como base para a futura Página
 * Regional do frontend; quando essa página existir, o BFF dela vai consumir
 * este endpoint via o token.
 *
 * Cache Redis 5 min (varyBy=params): cache só por slug; o token não entra
 * na chave (rota só responde 200 quando o token está OK, e o conteúdo do
 * 200 só depende do slug).
 */
const router = express.Router();

router.get(
  "/:baseCitySlug",
  requireInternalToken,
  cacheGet({ prefix: "internal:regions", ttlSeconds: 300, varyBy: ["params"] }),
  async (req, res, next) => {
    try {
      const region = await getRegionByBaseSlug(req.params.baseCitySlug);
      if (!region) {
        return res.status(404).json({ ok: false, error: "Region not found" });
      }
      return res.status(200).json({ ok: true, data: region });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
