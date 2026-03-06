import express from "express";
import * as adsController from "./ads.controller.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import {
  cacheGet,
  cacheInvalidatePrefix,
} from "../../shared/cache/cache.middleware.js";

const router = express.Router();

router.get(
  "/autocomplete",
  cacheGet({ prefix: "ads:auto", ttlSeconds: 20, varyBy: ["query"] }),
  adsController.autocomplete
);

router.get(
  "/facets",
  cacheGet({ prefix: "ads:facets", ttlSeconds: 60, varyBy: ["query"] }),
  adsController.facets
);

router.get(
  "/",
  cacheGet({ prefix: "ads:list", ttlSeconds: 30, varyBy: ["query"] }),
  adsController.list
);

router.get(
  "/search",
  cacheGet({ prefix: "ads:search", ttlSeconds: 30, varyBy: ["query"] }),
  adsController.search
);

router.get("/:identifier", adsController.show);

router.post("/", authMiddleware, async (req, res, next) => {
  try {
    await adsController.create(req, res, next);

    await cacheInvalidatePrefix("home");
    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");
    await cacheInvalidatePrefix("ads:facets");
  } catch (err) {
    next(err);
  }
});

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    await adsController.update(req, res, next);

    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");
    await cacheInvalidatePrefix("ads:facets");
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    await adsController.remove(req, res, next);

    await cacheInvalidatePrefix("home");
    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");
    await cacheInvalidatePrefix("ads:facets");
  } catch (err) {
    next(err);
  }
});

export default router;
