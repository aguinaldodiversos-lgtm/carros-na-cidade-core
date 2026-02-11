const express = require("express");
const alertsController = require("../../controllers/analytics/alerts.controller");
const opportunitiesController = require("../../controllers/analytics/opportunities.controller");
const router = express.Router();
const cityRadarController = require("../../controllers/analytics/cityRadar.controller");

router.get("/city-radar", cityRadarController);

router.get("/alerts", alertsController);
router.get("/opportunities", opportunitiesController);

module.exports = router;
