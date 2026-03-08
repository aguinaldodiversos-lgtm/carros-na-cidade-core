// src/modules/auth/auth.routes.js
import express from "express";
import * as authService from "./auth.service.js";
import * as passwordService from "./password.service.js";
import * as emailVerificationService from "./emailVerification.service.js";
import { loginRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const router = express.Router();

/* =====================================================
   HELPERS
===================================================== */

function ensureServiceMethod(service, methodName, serviceName) {
  if (typeof service?.[methodName] !== "function") {
    throw new AppError(
      `Método ${methodName} não disponível em ${serviceName}`,
      500,
      false
    );
  }

  return service[methodName];
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function requireNonEmpty(value, fieldName) {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new AppError(`Campo obrigatório: ${fieldName}`, 400);
  }

  return normalized;
}

/* =====================================================
   LOGIN
===================================================== */

router.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const email = requireNonEmpty(req.body?.email, "email").toLowerCase();
    const password = requireNonEmpty(req.body?.password, "password");

    const login = ensureServiceMethod(authService, "login", "auth.service.js");

    const tokens = await login(email, password, {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.status(200).json(tokens);
  } catch (err) {
    return next(err);
  }
});

/* =====================================================
   REFRESH
===================================================== */

router.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = requireNonEmpty(req.body?.refreshToken, "refreshToken");

    const refresh = ensureServiceMethod(
      authService,
      "refresh",
      "auth.service.js"
    );

    const tokens = await refresh(refreshToken, {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.status(200).json(tokens);
  } catch (err) {
    return next(err);
  }
});

/* =====================================================
   LOGOUT
===================================================== */

router.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = normalizeString(req.body?.refreshToken);

    const logout = ensureServiceMethod(
      authService,
      "logout",
      "auth.service.js"
    );

    const result = await logout(refreshToken || null);

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* =====================================================
   FORGOT PASSWORD
   Compatível com createPasswordResetToken ou requestPasswordReset
===================================================== */

router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = requireNonEmpty(req.body?.email, "email").toLowerCase();

    const forgotPasswordHandler =
      passwordService?.createPasswordResetToken ||
      passwordService?.requestPasswordReset;

    if (typeof forgotPasswordHandler !== "function") {
      throw new AppError(
        "Nenhum método de recuperação de senha disponível em password.service.js",
        500,
        false
      );
    }

    const result = await forgotPasswordHandler(email);

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* =====================================================
   RESET PASSWORD
===================================================== */

router.post("/reset-password", async (req, res, next) => {
  try {
    const token = requireNonEmpty(req.body?.token, "token");
    const newPassword = requireNonEmpty(req.body?.newPassword, "newPassword");

    const resetPasswordWithToken = ensureServiceMethod(
      passwordService,
      "resetPasswordWithToken",
      "password.service.js"
    );

    const result = await resetPasswordWithToken({
      token,
      newPassword,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

/* =====================================================
   VERIFY EMAIL
===================================================== */

router.post("/verify-email", async (req, res, next) => {
  try {
    const token = requireNonEmpty(req.body?.token, "token");

    const verifyEmail = ensureServiceMethod(
      emailVerificationService,
      "verifyEmail",
      "emailVerification.service.js"
    );

    const result = await verifyEmail(token);

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

export default router;
