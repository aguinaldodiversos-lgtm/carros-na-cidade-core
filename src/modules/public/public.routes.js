// src/modules/public/public.routes.js

import express from "express";
import { getHomeData } from "./public.controller.js";
import {
  getCityPage,
  getCityBrandClusterPage,
  getCityModelClusterPage,
  getCityOpportunityClusterPage,
  getCityBelowFipeClusterPage,
} from "./public-clusters.controller.js";
import { getCityById, resolveCity, searchCities } from "./public-city-query.controller.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

router.get("/home", cacheGet({ prefix: "home", ttlSeconds: 60, varyBy: ["query"] }), getHomeData);

router.get(
  "/cities/resolve",
  cacheGet({ prefix: "public:city:resolve", ttlSeconds: 120, varyBy: ["query"] }),
  resolveCity
);

// Sem cache Redis: lista depende do cadastro em `cities` e cache vazio atrapalha o painel após deploy.
router.get("/cities/search", searchCities);

router.get(
  "/cities/by-id/:id",
  cacheGet({ prefix: "public:city:byid", ttlSeconds: 300, varyBy: ["params"] }),
  getCityById
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

export default router;
