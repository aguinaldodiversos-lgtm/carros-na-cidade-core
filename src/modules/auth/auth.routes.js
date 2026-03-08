import express from "express";
import * as authService from "./auth.service.js";
import * as passwordService from "./password.service.js";
import * as emailVerificationService from "./emailVerification.service.js";
import { loginRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const router = express.Router();

function ensureMethod(service, candidates, serviceName) {
  for (const name of candidates) {
    if (typeof service?.[name] === "function") {
      return service[name];
    }
  }

  throw new AppError(
    `Método esperado não encontrado em ${serviceName}: ${candidates.join(" | ")}`,
    500,
    false
  );
}

function requireString(value, fieldName, { lowercase = false } = {}) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new AppError(`Campo obrigatório: ${fieldName}`, 400);
  }

  return lowercase ? normalized.toLowerCase() : normalized;
}

router.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const email = requireString(req.body?.email, "email", { lowercase: true });
    const password = requireString(req.body?.password, "password");

    const login = ensureMethod(authService, ["login"], "auth.service.js");

    const tokens = await login(email, password, {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.status(200).json(tokens);
  } catch (err) {
    return next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const refreshToken = requireString(req.body?.refreshToken, "refreshToken");

    const refresh = ensureMethod(authService, ["refresh"], "auth.service.js");

    const tokens = await refresh(refreshToken, {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
    });

    return res.status(200).json(tokens);
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = String(req.body?.refreshToken ?? "").trim();

    const logout = ensureMethod(authService, ["logout"], "auth.service.js");

    const result = await logout(refreshToken || null);

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = requireString(req.body?.email, "email", { lowercase: true });

    const requestPasswordReset = ensureMethod(
      passwordService,
      ["requestPasswordReset", "createPasswordResetToken"],
      "password.service.js"
    );

    const result = await requestPasswordReset(email);

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const token = requireString(req.body?.token, "token");
    const newPassword = requireString(req.body?.newPassword, "newPassword");

    const resetPassword = ensureMethod(
      passwordService,
      ["resetPasswordWithToken", "resetPassword"],
      "password.service.js"
    );

    let result;

    if (resetPassword.length >= 2) {
      result = await resetPassword(token, newPassword);
    } else {
      result = await resetPassword({ token, newPassword });
    }

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

router.post("/verify-email", async (req, res, next) => {
  try {
    const token = requireString(req.body?.token, "token");

    const verifyEmail = ensureMethod(
      emailVerificationService,
      ["verifyEmail"],
      "emailVerification.service.js"
    );

    const result = await verifyEmail(token);

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

export default router;
