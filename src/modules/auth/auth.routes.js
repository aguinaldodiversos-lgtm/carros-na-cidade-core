// src/modules/auth/auth.routes.js

import express from "express";
import * as authController from "./auth.controller.js";

const router = express.Router();

router.post("/login", authController.login);

export default router;
