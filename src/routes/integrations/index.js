const express = require("express");
const apiTokenAuth = require("../../middlewares/apiTokenAuth");
const createAdFromApi = require("../../controllers/integrations/createAdFromApi.controller");

const router = express.Router();

// Criar anúncio via integração
router.post("/ads", apiTokenAuth, createAdFromApi);

module.exports = router;
