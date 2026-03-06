import express from "express";
import * as authController from "./auth.controller.js";
import {
  requestPasswordReset,
  resetPasswordWithToken,
} from "./password.service.js";
import { verifyEmail } from "./emailVerification.service.js";
import { loginRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";

const router = express.Router();

router.post("/login", loginRateLimit, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    const result = await resetPasswordWithToken({
      token,
      newPassword,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const { token } = req.body;
    const result = await verifyEmail(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
