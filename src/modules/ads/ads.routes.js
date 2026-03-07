// src/modules/ads/ads.routes.js

import express from "express";
import * as adsController from "./ads.controller.js";
import * as autocompleteController from "./autocomplete/ads-autocomplete.controller.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import {
  cacheGet,
  cacheInvalidatePrefix,
} from "../../shared/cache/cache.middleware.js";

const router = express.Router();

/* =====================================================
   AUTOCOMPLETE BÁSICO
===================================================== */

router.get(
  "/autocomplete",
  cacheGet({ prefix: "ads:auto", ttlSeconds: 20, varyBy: ["query"] }),
  autocompleteController.autocomplete
);

/* =====================================================
   AUTOCOMPLETE SEMÂNTICO
===================================================== */

router.get(
  "/autocomplete/semantic",
  cacheGet({
    prefix: "ads:auto:semantic",
    ttlSeconds: 20,
    varyBy: ["query"],
  }),
  autocompleteController.semanticAutocomplete
);

/* =====================================================
   FACETS
===================================================== */

router.get(
  "/facets",
  cacheGet({ prefix: "ads:facets", ttlSeconds: 60, varyBy: ["query"] }),
  adsController.facets
);

/* =====================================================
   LISTAGEM PADRÃO
===================================================== */

router.get(
  "/",
  cacheGet({ prefix: "ads:list", ttlSeconds: 30, varyBy: ["query"] }),
  adsController.list
);

/* =====================================================
   BUSCA
===================================================== */

router.get(
  "/search",
  cacheGet({ prefix: "ads:search", ttlSeconds: 30, varyBy: ["query"] }),
  adsController.search
);

/* =====================================================
   DETALHE
===================================================== */

router.get("/:identifier", adsController.show);

/* =====================================================
   CRIAR
===================================================== */

router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const ad = await adsController.create(req, res, next);

    await cacheInvalidatePrefix("home");
    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");
    await cacheInvalidatePrefix("ads:auto:semantic");
    await cacheInvalidatePrefix("ads:facets");

    return ad;
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   ATUALIZAR
===================================================== */

router.put("/:id", authMiddleware, async (req, res, next) => {
  try {
    const ad = await adsController.update(req, res, next);

    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");
    await cacheInvalidatePrefix("ads:auto:semantic");
    await cacheInvalidatePrefix("ads:facets");

    return ad;
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   REMOVER
===================================================== */

router.delete("/:id", authMiddleware, async (req, res, next) => {
  try {
    const result = await adsController.remove(req, res, next);

    await cacheInvalidatePrefix("home");
    await cacheInvalidatePrefix("ads:list");
    await cacheInvalidatePrefix("ads:search");
    await cacheInvalidatePrefix("ads:auto");
    await cacheInvalidatePrefix("ads:auto:semantic");
    await cacheInvalidatePrefix("ads:facets");

    return result;
  } catch (err) {
    next(err);
  }
});

export default router;
