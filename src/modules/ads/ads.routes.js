import express from "express";
import * as adsController from "./ads.controller.js";
import * as autocompleteController from "./autocomplete/ads-autocomplete.controller.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

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

router.post("/", authMiddleware, adsController.create);

router.put("/:id", authMiddleware, adsController.update);

router.delete("/:id", authMiddleware, adsController.remove);

export default router;
