import express from "express";
import * as dealersController from "./dealers.controller.js";

const router = express.Router();

router.get("/city/:slug", dealersController.listCityDealers);
router.get("/:id", dealersController.showDealerProfile);

export default router;
