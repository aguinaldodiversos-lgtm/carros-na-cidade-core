import express from "express";
import { getHomeData } from "./public.controller.js";
import { getCityLandingData } from "./public-city.controller.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

router.get(
  "/home",
  cacheGet({ prefix: "home", ttlSeconds: 60, varyBy: ["query"] }),
  getHomeData
);

router.get(
  "/cities/:slug",
  cacheGet({ prefix: "public:city", ttlSeconds: 60, varyBy: ["params", "query"] }),
  getCityLandingData
);

export default router;
