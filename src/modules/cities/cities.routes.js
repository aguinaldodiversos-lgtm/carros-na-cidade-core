import express from "express";
import * as citiesController from "./cities.controller.js";

const router = express.Router();

router.get("/", citiesController.listTopCities);
router.get("/:slug", citiesController.showCityBySlug);

export default router;
