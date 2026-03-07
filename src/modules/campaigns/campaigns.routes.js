import express from "express";
import * as campaignsController from "./campaigns.controller.js";

const router = express.Router();

router.get("/city/:cityId", campaignsController.listCityCampaigns);

export default router;
