import express from "express";
import { getHomeData } from "./public.controller.js";
import { listPublicHeroBanners } from "../admin/home/admin-home.service.js";
import {
  getCityPage,
  getCityBrandClusterPage,
  getCityModelClusterPage,
  getCityOpportunityClusterPage,
  getCityBelowFipeClusterPage,
} from "./public-clusters.controller.js";
import {
  getCityById,
  getCatalogAdsTerritoryFallback,
  resolveCity,
  searchCities,
} from "./public-city-query.controller.js";
import { getFeaturedRegionsByState } from "./public-state.controller.js";
import { getPublicRegionByCitySlug } from "./public-region.controller.js";
import { getPublicDealerBySlug } from "./public-dealer.controller.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";
import { autocompleteRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";

const router = express.Router();

router.get("/home", cacheGet({ prefix: "home", ttlSeconds: 60, varyBy: ["query"] }), getHomeData);

/**
 * Carrossel do hero da Home — conteúdo editável pelo admin (Fase 4.1.1).
 *
 * Retorna até 3 banners ATIVOS, ordenados por position. Quando nenhum
 * está ativo, retorna lista vazia — frontend público cai no fallback
 * hardcoded sem precisar tratar erro.
 *
 * Contrato:
 *   { success: true, data: { banners: HomeHeroBanner[] } }
 *
 * Por que embrulhar em objeto?
 *   Compatibilidade com mock retornado pela 4.1 (data: null). O frontend
 *   trata data como objeto-ou-null. Embrulhar também antecipa metadados
 *   futuros (TTL hint, version cap) sem quebrar o contrato.
 *
 * Cache 60s alinhado a `/home`. PATCH no admin dispara
 * revalidateTag('public-home-hero') via BFF Next; este TTL é fallback.
 */
router.get(
  "/home/hero",
  cacheGet({ prefix: "public:home:hero", ttlSeconds: 60, varyBy: [] }),
  async (_req, res, next) => {
    try {
      const banners = await listPublicHeroBanners();
      res.json({ success: true, data: { banners } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Regiões destacadas por estado — alimenta o bloco "Explore por região" da
 * Página Estadual e CTAs leves na Home. Cache 5 min: o payload depende de
 * agregação SQL não-trivial (haversine + contagem de anúncios por região)
 * e a lista de regiões muda pouco em escala de minutos.
 *
 * `varyBy: ["params", "query"]` para diferenciar:
 *   - params.uf — cada estado tem seu próprio cache key.
 *   - query.limit — caller pode pedir 8 (default) ou 12 (hard cap).
 */
router.get(
  "/states/:uf/regions",
  cacheGet({ prefix: "public:state:regions", ttlSeconds: 300, varyBy: ["params", "query"] }),
  getFeaturedRegionsByState
);

/**
 * Página Regional pública por citySlug canônico (`nome-uf`).
 *
 * `GET /api/public/regions/atibaia-sp` → resolve a região da cidade-base
 * com payload leve, sanitizado e sem token. Universal: funciona para
 * qualquer cidade brasileira cadastrada com latitude/longitude.
 *
 * Cache 15 min (mais agressivo que `/states/:uf/regions` porque a
 * vizinhança haversine muda apenas quando o admin altera radius ou
 * quando lat/lng de cidades é re-seeded — eventos raros).
 */
router.get(
  "/regions/:citySlug",
  cacheGet({ prefix: "public:region", ttlSeconds: 900, varyBy: ["params"] }),
  getPublicRegionByCitySlug
);

router.get(
  "/cities/resolve",
  cacheGet({ prefix: "public:city:resolve", ttlSeconds: 120, varyBy: ["query"] }),
  resolveCity
);

router.get("/cities/search", autocompleteRateLimit, searchCities);

router.get(
  "/cities/by-id/:id",
  cacheGet({ prefix: "public:city:byid", ttlSeconds: 300, varyBy: ["params"] }),
  getCityById
);

router.get(
  "/cities/:slug/catalog-ads-fallback",
  cacheGet({ prefix: "public:city:ads-fallback", ttlSeconds: 60, varyBy: ["params"] }),
  getCatalogAdsTerritoryFallback
);

router.get(
  "/cities/:slug",
  cacheGet({ prefix: "public:city", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityPage
);

router.get(
  "/cities/:slug/brand/:brand",
  cacheGet({ prefix: "public:city:brand", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityBrandClusterPage
);

router.get(
  "/cities/:slug/brand/:brand/model/:model",
  cacheGet({ prefix: "public:city:model", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityModelClusterPage
);

router.get(
  "/cities/:slug/opportunities",
  cacheGet({ prefix: "public:city:opportunities", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityOpportunityClusterPage
);

router.get(
  "/cities/:slug/below-fipe",
  cacheGet({ prefix: "public:city:below-fipe", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityBelowFipeClusterPage
);

/**
 * Página pública da loja (briefing 2026-05-25):
 *   GET /api/public/dealers/:slug → dealer + anúncios ativos sanitizados.
 *
 * Cache curto (60s) porque inventário de loja muda durante o dia. `varyBy:
 * ["params"]` é suficiente — sem querystring nesta versão.
 */
router.get(
  "/dealers/:slug",
  cacheGet({ prefix: "public:dealer", ttlSeconds: 60, varyBy: ["params"] }),
  getPublicDealerBySlug
);

export default router;
