import express from "express";
import { getCityLandingData } from "../public/public-city.controller.js";

const router = express.Router();

router.get("/:slug/public", getCityLandingData);

export default router;
