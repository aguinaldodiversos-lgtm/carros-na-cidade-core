const express = require("express");
const auth = require("../../middlewares/auth");

const router = express.Router();

/* =====================================================
   CONTROLLERS
===================================================== */
const createController = require("../../controllers/ads/create.controller");
const listController = require("../../controllers/ads/list.controller");
const showController = require("../../controllers/ads/show.controller");
const cityController = require("../../controllers/ads/city.controller");
const brandController = require("../../controllers/ads/brand.controller");
const modelController = require("../../controllers/ads/model.controller");
const searchController = require("../../controllers/ads/search.controller");

// novo controller de métricas
const {
  getAdMetrics,
} = require("../../controllers/ads/getAdMetrics.controller");

/* =====================================================
   ROTAS DE BUSCA
===================================================== */

// Busca com filtros (home, filtros, ofertas)
router.get("/search", searchController);

/* =====================================================
   ROTAS PRINCIPAIS (PÚBLICAS)
===================================================== */

// Listar anúncios
router.get("/", listController);

// Detalhe do anúncio por slug
router.get("/carro/:slug", showController);

/* =====================================================
   ROTAS DO LOJISTA (PROTEGIDAS)
===================================================== */

// Criar anúncio
router.post("/", auth, createController);

/* =====================================================
   MÉTRICAS DO ANÚNCIO
   Usado para popup antes de excluir
===================================================== */

router.get("/:adId/metrics", auth, getAdMetrics);

/* =====================================================
   ROTAS SEO
===================================================== */

// SEO por cidade
router.get("/cidade/:city-:state", cityController);

// SEO por marca
router.get("/cidade/:city-:state/:brand", brandController);

// SEO por modelo
router.get("/cidade/:city-:state/:brand/:model", modelController);

module.exports = router;
