import express from "express";
import * as controller from "./market-intelligence.controller.js";

const router = express.Router();

router.get("/top-opportunities", controller.listTopOpportunities);
router.get("/signals", controller.listOpportunitySignals);
router.get("/cities/:slug", controller.showCityOpportunity);

export default router;
