import express from "express";
import { loginRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

import * as AuthServiceNS from "./auth.service.js";
import * as PasswordServiceNS from "./password.service.js";
import * as EmailVerificationServiceNS from "./emailVerification.service.js";

const router = express.Router();

function resolveModule(ns) {
  const mod = ns?.default ?? ns;
  if (mod && typeof mod === "object") return { ...mod, ...ns };
  return ns;
}

const AuthService = resolveModule(AuthServiceNS);
const PasswordService = resolveModule(PasswordServiceNS);
const EmailVerificationService = resolveModule(EmailVerificationServiceNS);

function pickFn(mod, candidates) {
  for (const name of candidates) {
    const fn = mod?.[name];
    if (typeof fn === "function") return fn;
  }
  return null;
}

function ensureFn(mod, candidates, serviceName) {
  const fn = pickFn(mod, candidates);
  if (fn) return fn;
  throw new AppError(`Método esperado não encontrado em ${serviceName}: ${candidates.join(" | ")}`, 500, false);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireString(value, fieldName, { lowercase = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new AppError(`Campo obrigatório: ${fieldName}`, 400);
  return lowercase ? normalized.toLowerCase() : normalized;
}

/** LOGIN (mantém /login) */
router.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const email = requireString(req.body?.email, "email", { lowercase: true });
    const password = requireString(req.body?.password, "password");

    const login = ensureFn(AuthService, ["login", "signIn", "signin", "authenticate"], "auth.service.js");

    const meta = { ip: req.ip, userAgent: req.headers["user-agent"] || null };

    // suporta assinatura antiga (email, pass, meta) e nova ({email,password})
    let result;
    try {
      result = login.length >= 2 ? await login(email, password, meta) : await login({ email, password, ...meta });
    } catch (e) {
      // fallback
      result = await login({ email, password, ...meta });
    }

    return res.status(200).json(result);
  })
);

/** REFRESH + LOGOUT (se existir no service) */
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = requireString(req.body?.refreshToken, "refreshToken");
    const refresh = ensureFn(AuthService, ["refresh"], "auth.service.js");
    const meta = { ip: req.ip, userAgent: req.headers["user-agent"] || null };

    let result;
    try {
      result = refresh.length >= 2 ? await refresh(refreshToken, meta) : await refresh({ refreshToken, ...meta });
    } catch {
      result = await refresh({ refreshToken, ...meta });
    }

    return res.status(200).json(result);
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = String(req.body?.refreshToken ?? "").trim() || null;
    const logout = ensureFn(AuthService, ["logout"], "auth.service.js");
    const result = await logout(refreshToken);
    return res.status(200).json(result ?? { ok: true });
  })
);

/** REGISTER (se existir) */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const email = requireString(req.body?.email, "email", { lowercase: true });
    const password = requireString(req.body?.password, "password");
    const name = String(req.body?.name ?? "").trim() || null;

    const register = ensureFn(AuthService, ["register", "signUp", "signup", "createUser", "createAccount"], "auth.service.js");
    const result = await register({ name, email, password });
    return res.status(201).json(result ?? { ok: true });
  })
);

/** PASSWORD RESET (mantém rotas antigas E novas) */
async function handleForgotPassword(req, res) {
  const email = requireString(req.body?.email, "email", { lowercase: true });
  const fn = ensureFn(PasswordService, ["createPasswordResetToken", "requestPasswordReset"], "password.service.js");

  try {
    await fn(email);
  } catch {
    // não vazar enumeração
  }

  return res.status(200).json({ ok: true, message: "Se o email existir, enviaremos instruções para redefinir a senha." });
}

router.post("/forgot-password", asyncHandler(handleForgotPassword));
router.post("/password/forgot", asyncHandler(handleForgotPassword));

async function handleResetPassword(req, res) {
  const token = requireString(req.body?.token, "token");
  const newPassword = requireString(req.body?.newPassword, "newPassword");

  const fn = ensureFn(PasswordService, ["resetPasswordWithToken", "resetPassword"], "password.service.js");

  let result;
  try {
    result = fn.length >= 2 ? await fn(token, newPassword) : await fn({ token, newPassword });
  } catch {
    result = await fn({ token, newPassword });
  }

  return res.status(200).json(result ?? { ok: true });
}

router.post("/reset-password", asyncHandler(handleResetPassword));
router.post("/password/reset", asyncHandler(handleResetPassword));

/** EMAIL VERIFY (mantém rotas antigas E novas) */
async function handleVerifyEmail(req, res) {
  const token = requireString(req.body?.token ?? req.query?.token, "token");
  const verify = ensureFn(EmailVerificationService, ["verifyEmailWithToken", "verifyEmailToken", "verifyEmail", "confirmEmail"], "emailVerification.service.js");

  let result;
  try {
    result = await verify(token);
  } catch {
    result = await verify({ token });
  }
  return res.status(200).json(result ?? { ok: true });
}

router.post("/verify-email", asyncHandler(handleVerifyEmail));
router.all("/email/verify", asyncHandler(handleVerifyEmail));

export const authRouter = router;
export default router;
