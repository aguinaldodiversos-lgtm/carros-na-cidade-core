// src/modules/public/public.routes.js

import express from "express";
import { getHomeData } from "./public.controller.js";

const router = express.Router();

router.get("/home", getHomeData);

export default router;
