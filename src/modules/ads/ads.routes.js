import express from "express";
import * as adsController from "./ads.controller.js";
import * as autocompleteController from "./autocomplete/ads-autocomplete.controller.js";
import { adsPublishImageUpload } from "./ads-upload.middleware.js";
import { VEHICLE_IMAGE_MAX_FILES } from "./ads.upload.constants.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

router.post(
  "/upload-images",
  authMiddleware,
  adsPublishImageUpload.array("photos", VEHICLE_IMAGE_MAX_FILES),
  adsController.uploadPublishImages
);

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

// Fase 4: tela interna pós-revisão consulta este endpoint pra saber
// quais ações estão disponíveis. DEVE ficar ANTES de GET /:identifier
// (que é greedy e capturaria '/:id/publication-options' senão).
router.get(
  "/:id/publication-options",
  authMiddleware,
  adsController.publicationOptions
);

router.get("/:identifier", adsController.show);

router.post("/", authMiddleware, adsController.create);

router.put("/:id", authMiddleware, adsController.update);

router.delete("/:id", authMiddleware, adsController.remove);

export default router;
