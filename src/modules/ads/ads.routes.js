import express from "express";
import * as adsController from "./ads.controller.js";

const router = express.Router();

router.get("/", adsController.list);
router.get("/:id", adsController.show);
router.post("/", adsController.create);

export default router;
