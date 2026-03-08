import express from "express";
import * as adsController from "./ads.controller.js";
import * as autocompleteController from "./autocomplete/ads-autocomplete.controller.js";
import * as adsService from "./ads.service.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { validateAdId, validateCreateAdPayload } from "./ads.validators.js";
import {
  cacheGet,
  cacheInvalidatePrefix,
} from "../../shared/cache/cache.middleware.js";

const router = express.Router();

async function invalidateAdsCaches() {
  await Promise.allSettled([
    cacheInvalidatePrefix("home"),
    cacheInvalidatePrefix("ads:list"),
    cacheInvalidatePrefix("ads:search"),
    cacheInvalidatePrefix("ads:auto"),
    cacheInvalidatePrefix("ads:auto:semantic"),
    cacheInvalidatePrefix("ads:facets"),
    cacheInvalidatePrefix("public:city"),
    cacheInvalidatePrefix("public:city:brand"),
    cacheInvalidatePrefix("public:city:model"),
    cacheInvalidatePrefix("public:city:opportunities"),
    cacheInvalidatePrefix("public:city:below-fipe"),
  ]);
}

router.get(
  "/autocomplete",
  cacheGet({ prefix: "ads:auto", ttlSeconds: 20, varyBy: ["query"] }),
  autocompleteController.autocomplete
);

router.get(
  "/autocomplete/semantic",
  cacheGet({
    prefix: "ads:auto:semantic",
    ttlSeconds: 20,
    varyBy: ["query"],
  }),
  autocompleteController.semanticAutocomplete
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
    const payload = validateCreateAdPayload(req.body);
    const ad = await adsService.create(payload, req.user);

    await invalidateAdsCaches();

    res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
});

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    const id = validateAdId(req.params.id);
    const ad = await adsService.update(id, req.body, req.user);

    await invalidateAdsCaches();

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    const id = validateAdId(req.params.id);
    await adsService.remove(id, req.user);

    await invalidateAdsCaches();

    res.json({
      success: true,
      message: "Anúncio removido com sucesso",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
