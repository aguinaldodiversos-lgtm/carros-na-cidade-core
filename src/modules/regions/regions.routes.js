import express from "express";
import { cacheGet } from "../../shared/cache/cache.middleware.js";
import { requireInternalToken } from "./regions.middleware.js";
import { getAncoraBySlugPart, getRegionByBaseSlugDynamic } from "./regions.service.js";

/**
 * Rotas internas do recurso "região aproximada".
 *
 * NÃO é exposto em sitemap, NÃO aparece em /api/public, e exige
 * X-Internal-Token (qualquer chamada sem o header correto recebe 404 — ver
 * regions.middleware.js). Serve como base para a Página Regional do
 * frontend (BFF em frontend/lib/regions/fetch-region.ts).
 *
 * O raio usado para montar a região é lido de platform_settings
 * (key `regional.radius_km`, default 80, range 10..150) — editável pelo
 * admin via /api/admin/regional-settings. Quando o admin altera, o cache
 * Redis abaixo é invalidado pelo admin-regional-settings.service.js.
 *
 * Cache Redis 5 min (varyBy=params): cache só por slug; o token não entra
 * na chave (rota só responde 200 quando o token está OK, e o conteúdo do
 * 200 só depende do slug + radius corrente).
 */
const router = express.Router();

router.get(
  "/:baseCitySlug",
  requireInternalToken,
  cacheGet({ prefix: "internal:regions", ttlSeconds: 300, varyBy: ["params"] }),
  async (req, res, next) => {
    try {
      const region = await getRegionByBaseSlugDynamic(req.params.baseCitySlug);
      if (!region) {
        return res.status(404).json({ ok: false, error: "Region not found" });
      }
      return res.status(200).json({ ok: true, data: region });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * Resolve a região de uma cidade-âncora pelo padrão de URL público:
 *   GET /api/internal/regions/ancora/:uf/:ancora
 *
 * Diferença em relação à rota /:baseCitySlug:
 *  - Aceita ancoraPart sem sufixo de UF (ex: "atibaia" em vez de "atibaia-sp").
 *  - Rejeita cidades que não sejam âncoras ativas (is_ancora = false).
 *  - Cache Redis 5 min por (uf, ancora).
 *
 * Usado pelo BFF `fetch-region-ancora.ts` que alimenta a Página Regional
 * nova em /[uf]/regiao/[ancora].
 */
router.get(
  "/ancora/:uf/:ancora",
  requireInternalToken,
  cacheGet({
    prefix: "internal:regions:ancora",
    ttlSeconds: 300,
    varyBy: ["params"],
  }),
  async (req, res, next) => {
    try {
      const anchor = await getAncoraBySlugPart(req.params.ancora, req.params.uf);
      if (!anchor) {
        return res.status(404).json({ ok: false, error: "Ancora not found" });
      }
      const region = await getRegionByBaseSlugDynamic(anchor.slug);
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
