const express = require('express');
const auth = require('../../middlewares/auth');

const createController = require('../../controllers/ads/create.controller');
const listController = require('../../controllers/ads/list.controller');
const showController = require('../../controllers/ads/show.controller');
const cityController = require('../../controllers/ads/city.controller');
const brandController = require('../../controllers/ads/brand.controller');
const modelController = require('../../controllers/ads/model.controller');
const searchController = require('../../controllers/ads/search.controller');

const { Pool } = require("pg");

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   ROTAS DE BUSCA
===================================================== */

// Busca com filtros (home, filtros, ofertas)
router.get('/search', searchController);

/* =====================================================
   ROTAS PRINCIPAIS
===================================================== */

router.post('/', auth, createController);
router.get('/', listController);
router.get('/carro/:slug', showController);

/* =====================================================
   MELHORES OFERTAS DA CIDADE
===================================================== */

router.get('/best-deals', async (req, res) => {
  try {
    const { city, limit = 10 } = req.query;

    if (!city) {
      return res.status(400).json({ er
