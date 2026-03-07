import express from "express";
import * as citiesScoreController from "./cities-score.controller.js";

const router = express.Router();

router.get("/ranking/top", citiesScoreController.listTopRankedCities);
router.get("/ranking/:slug", citiesScoreController.showCityScore);

export default router;
