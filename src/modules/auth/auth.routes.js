import express from "express";
import * as authService from "./auth.service.js";
import * as passwordService from "./password.service.js";
import * as emailVerificationService from "./emailVerification.service.js";
import { loginRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";

const router = express.Router();

router.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const tokens = await authService.login(email, password, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const tokens = await authService.refresh(refreshToken, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.logout(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (typeof passwordService.requestPasswordReset !== "function") {
      throw new Error("requestPasswordReset não exportado em password.service.js");
    }

    const result = await passwordService.requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (typeof passwordService.resetPasswordWithToken !== "function") {
      throw new Error("resetPasswordWithToken não exportado em password.service.js");
    }

    const result = await passwordService.resetPasswordWithToken({
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

    if (typeof emailVerificationService.verifyEmail !== "function") {
      throw new Error("verifyEmail não exportado em emailVerification.service.js");
    }

    const result = await emailVerificationService.verifyEmail(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
