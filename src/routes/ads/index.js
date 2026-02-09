const express = require('express');
const auth = require('../../middlewares/auth');

const createController = require('../../controllers/ads/create.controller');
const listController = require('../../controllers/ads/list.controller');
const showController = require('../../controllers/ads/show.controller');
const cityController = require('../../controllers/ads/city.controller');
const brandController = require('../../controllers/ads/brand.controller');
const modelController = require('../../controllers/ads/model.controller');

const router = express.Router();

router.post('/', auth, createController);
router.get('/', listController);
router.get('/carro/:slug', showController);

// SEO por cidade
router.get('/cidade/:city-:state', cityController);

// SEO por marca
router.get('/cidade/:city-:state/:brand', brandController);

// SEO por modelo
router.get('/cidade/:city-:state/:brand/:model', modelController);

module.exports = router;
