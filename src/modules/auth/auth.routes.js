// src/modules/auth/auth.routes.js

import express from "express";
import * as authController from "./auth.controller.js";
import { validate } from "../../shared/middlewares/validate.middleware.js";
import {
  loginSchema,
  refreshSchema,
} from "./auth.validator.js";

const router = express.Router();

router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", validate(refreshSchema), authController.refresh);
router.post("/logout", authController.logout);

export default router;
