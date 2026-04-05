// src/modules/vehicle-images/vehicle-images.routes.js
import { Router } from "express";
import { getVehicleImageByKey } from "./vehicle-images.controller.js";

const router = Router();

router.get("/", getVehicleImageByKey);

export default router;
