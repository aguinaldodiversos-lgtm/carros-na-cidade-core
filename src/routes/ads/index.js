const express = require('express');
const auth = require('../../middlewares/auth');

const createController = require('../../controllers/ads/create.controller');
const listController = require('../../controllers/ads/list.controller');
const showController = require('../../controllers/ads/show.controller');

const router = express.Router();

router.post('/', auth, createController);
router.get('/', listController);
router.get('/carro/:slug', showController);

module.exports = router;
