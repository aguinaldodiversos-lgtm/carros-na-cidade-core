import express from "express";
import * as adsController from "./ads.controller.js";
import * as adReportsController from "./reports/ad-reports.controller.js";
import * as autocompleteController from "./autocomplete/ads-autocomplete.controller.js";
import * as adDescriptionController from "./description-suggestion/ad-description.controller.js";
import {
  descriptionSuggestionUserRateLimit,
  descriptionSuggestionDraftRateLimit,
} from "./description-suggestion/ad-description.rate-limit.js";
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
export const ADS_ALLOWED_QUERY_KEYS = Object.freeze([
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
  // Filtros canônicos da Fase 3. PRECISAM estar aqui: `filterQuery` no
  // cache.middleware descarta da cache key toda chave fora desta lista,
  // então sem eles `?city_slug=x` e `?city_slug=x&seller_kind=private`
  // colidiriam na MESMA key do Redis (TTL 30s) — o filtro "não filtraria"
  // de forma intermitente, dependendo de quem populou o cache primeiro.
  // Até 2026-07-26 isso ficou latente porque os dois primeiros quebravam
  // o countQuery e o cacheGet se recusa a cachear `ok:false`; corrigir os
  // JOINs sem corrigir esta lista trocaria um bug por outro, pior.
  "seller_kind",
  "opportunity",
  "priority_tier",
  // Mesma classe de omissão, encontrada pelo teste derivado do schema
  // (tests/ads/ads-cache-key-covers-filters.test.js): ambos restringem o
  // WHERE de verdade — `highlight` é alias legado de `highlight_only`
  // (normalizado no parser) e `advertiser_id` vira `a.advertiser_id = $N`.
  // Sem eles na key, a página de uma loja podia servir o catálogo inteiro.
  "highlight",
  "advertiser_id",
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

/**
 * Sugestão de descrição do passo de Revisão (Fase 4.5).
 *
 * Caminho literal ANTES de `/:identifier` e `/:id/*` para não ser capturado
 * por eles. Autenticado (anônimo leva 401 do authMiddleware) e com dois
 * limiters por usuário — ver ad-description.rate-limit.js.
 */
router.post(
  "/description-suggestion",
  authMiddleware,
  descriptionSuggestionUserRateLimit,
  descriptionSuggestionDraftRateLimit,
  adDescriptionController.suggest
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
