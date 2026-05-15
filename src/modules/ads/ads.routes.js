import express from "express";
import * as adsController from "./ads.controller.js";
import * as adReportsController from "./reports/ad-reports.controller.js";
import * as autocompleteController from "./autocomplete/ads-autocomplete.controller.js";
import { adsPublishImageUpload } from "./ads-upload.middleware.js";
import { VEHICLE_IMAGE_MAX_FILES } from "./ads.upload.constants.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { cacheGet } from "../../shared/cache/cache.middleware.js";

/**
 * Whitelist de query params que entram na cache key das rotas publicas de ads.
 * Parametros fora desta lista (utm_*, fbclid, gclid, cache busters aleatorios)
 * SAO IGNORADOS na chave — mas continuam sendo lidos pelo controller, entao
 * se um deles afeta a SQL um teste de regressao captura.
 *
 * Sincronizado com `parseAdsFilters` e `parseAdsFacetFilters` em filters/
 * ads-filter.parser.js — qualquer filtro novo no controller que altere o
 * resultado precisa entrar aqui senao o cache vira HIT incorreto.
 */
const ADS_ALLOWED_QUERY_KEYS = Object.freeze([
  // Paginacao / ordenacao
  "page",
  "limit",
  "sort",
  // Veiculo
  "brand",
  "model",
  "version",
  "year_min",
  "year_max",
  "mileage_max",
  "mileage_min",
  "body_type",
  "fuel",
  "fuel_type",
  "transmission",
  // Localizacao (city_slug e city_slugs sao escalar OU array; ambos cobertos)
  "city",
  "city_id",
  "city_slug",
  "city_slugs",
  "city_slugs[]",
  "state",
  // Preco
  "min_price",
  "max_price",
  "price_min",
  "price_max",
  // Comercial
  "seller_type",
  "featured",
  "highlight_only",
  "below_fipe",
  // Busca textual
  "q",
]);

const AUTOCOMPLETE_ALLOWED_QUERY_KEYS = Object.freeze(["q", "limit", "current_city_slug"]);

const router = express.Router();

router.post(
  "/upload-images",
  authMiddleware,
  adsPublishImageUpload.array("photos", VEHICLE_IMAGE_MAX_FILES),
  adsController.uploadPublishImages
);

router.get(
  "/autocomplete",
  cacheGet({
    prefix: "ads:auto",
    ttlSeconds: 20,
    varyBy: ["query"],
    allowedQueryKeys: AUTOCOMPLETE_ALLOWED_QUERY_KEYS,
  }),
  autocompleteController.autocomplete
);

router.get(
  "/autocomplete/semantic",
  cacheGet({
    prefix: "ads:auto:semantic",
    ttlSeconds: 20,
    varyBy: ["query"],
    allowedQueryKeys: AUTOCOMPLETE_ALLOWED_QUERY_KEYS,
  }),
  autocompleteController.semanticAutocomplete
);

router.get(
  "/facets",
  cacheGet({
    prefix: "ads:facets",
    ttlSeconds: 60,
    varyBy: ["query"],
    allowedQueryKeys: ADS_ALLOWED_QUERY_KEYS,
  }),
  adsController.facets
);

router.get(
  "/",
  cacheGet({
    prefix: "ads:list",
    ttlSeconds: 30,
    varyBy: ["query"],
    allowedQueryKeys: ADS_ALLOWED_QUERY_KEYS,
  }),
  adsController.list
);

router.get(
  "/search",
  cacheGet({
    prefix: "ads:search",
    ttlSeconds: 30,
    varyBy: ["query"],
    allowedQueryKeys: ADS_ALLOWED_QUERY_KEYS,
  }),
  adsController.search
);

// Fase 4: tela interna pós-revisão consulta este endpoint pra saber
// quais ações estão disponíveis. DEVE ficar ANTES de GET /:identifier
// (que é greedy e capturaria '/:id/publication-options' senão).
router.get("/:id/publication-options", authMiddleware, adsController.publicationOptions);

// Denúncia pública de anúncio. Aceita anônimo (sem authMiddleware) com
// rate limit por IP (sha256 hash) no service. Logado tem precedência se
// req.user já estiver populado por algum middleware upstream — mas não
// exigimos auth para reduzir fricção do fluxo do comprador.
// DEVE ficar ANTES de GET /:identifier para não ser engolido pela rota
// genérica de show.
router.post("/:id/report", adReportsController.create);

router.get("/:identifier", adsController.show);

router.post("/", authMiddleware, adsController.create);

router.put("/:id", authMiddleware, adsController.update);

router.delete("/:id", authMiddleware, adsController.remove);

export default router;
