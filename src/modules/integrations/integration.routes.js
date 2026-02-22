import express from "express";
import { verifyHmac } from "./integration.auth.js";
import * as integrationController from "./integration.controller.js";

const router = express.Router();

router.post(
  "/ads",
  verifyHmac,
  integrationController.createAd
);

export default router;
