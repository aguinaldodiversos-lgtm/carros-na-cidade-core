import express from "express";
import { getHomeData } from "./public.controller.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

router.get(
  "/home",
  cacheGet({ prefix: "home", ttlSeconds: 60, varyBy: ["query"] }),
  getHomeData
);

export default router;
