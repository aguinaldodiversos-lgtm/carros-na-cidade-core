// src/modules/public/public.routes.js

import express from "express";

import { cacheGet } from "../../shared/cache/cache.middleware.js";
import { getHomeData } from "./public.controller.js";
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
import { getPublicSitemapXml } from "./public-seo.controller.js";

const router = express.Router();

/**
 * Rotas SEO e estáticas devem vir antes de qualquer rota dinâmica.
 * Isso evita que paths como `/seo/sitemap` sejam capturados por handlers genéricos.
 */
router.get(
  "/seo/sitemap",
  cacheGet({ prefix: "public:seo:sitemap", ttlSeconds: 300, varyBy: ["query"] }),
  getPublicSitemapXml
);

// Opcional, mas útil para compatibilidade com ferramentas que esperam `.xml`
router.get(
  "/seo/sitemap.xml",
  cacheGet({ prefix: "public:seo:sitemap:xml", ttlSeconds: 300, varyBy: ["query"] }),
  getPublicSitemapXml
);

router.get(
  "/home",
  cacheGet({ prefix: "home", ttlSeconds: 60, varyBy: ["query"] }),
  getHomeData
);

router.get(
  "/cities/resolve",
  cacheGet({ prefix: "public:city:resolve", ttlSeconds: 120, varyBy: ["query"] }),
  resolveCity
);

// Sem cache Redis: lista depende do cadastro em `cities` e cache vazio atrapalha o painel após deploy.
router.get("/cities/search", searchCities);

router.get(
  "/cities/by-id/:id(\\d+)",
  cacheGet({ prefix: "public:city:byid", ttlSeconds: 300, varyBy: ["params"] }),
  getCityById
);

router.get(
  "/cities/:slug/catalog-ads-fallback",
  cacheGet({ prefix: "public:city:ads-fallback", ttlSeconds: 60, varyBy: ["params"] }),
  getCatalogAdsTerritoryFallback
);

/**
 * Rotas mais específicas antes das mais genéricas.
 * Mesmo quando o Express já diferencia corretamente, essa ordem deixa a intenção mais clara
 * e reduz risco de regressão futura.
 */
router.get(
  "/cities/:slug/brand/:brand/model/:model",
  cacheGet({ prefix: "public:city:model", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityModelClusterPage
);

router.get(
  "/cities/:slug/brand/:brand",
  cacheGet({ prefix: "public:city:brand", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityBrandClusterPage
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

router.get(
  "/cities/:slug",
  cacheGet({ prefix: "public:city", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityPage
);

export default router;
