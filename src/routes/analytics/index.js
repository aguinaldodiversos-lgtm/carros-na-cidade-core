const express = require("express");
const alertsController = require("../../controllers/analytics/alerts.controller");

const router = express.Router();

router.get("/alerts", alertsController);

module.exports = router;
