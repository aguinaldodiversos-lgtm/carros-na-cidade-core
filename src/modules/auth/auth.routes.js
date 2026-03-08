import express from "express";

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

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function badRequest(res, message, details) {
  return res.status(400).json({ error: message, ...(details ? { details } : {}) });
}

function serviceMissing(res, serviceName, expected) {
  return res.status(500).json({
    error: `Service misconfigured: ${serviceName}`,
    missing: expected,
  });
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!email || !password) return badRequest(res, "Email e password são obrigatórios.");

    const register = pickFn(AuthService, ["register", "signUp", "signup", "createUser", "createAccount"]);
    if (!register) {
      return serviceMissing(res, "auth.service.js", ["register | signUp | signup | createUser | createAccount"]);
    }

    const result = await register({ name, email, password });
    return res.status(201).json(result ?? { ok: true });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return badRequest(res, "Email e password são obrigatórios.");

    const login = pickFn(AuthService, ["login", "signIn", "signin", "authenticate"]);
    if (!login) {
      return serviceMissing(res, "auth.service.js", ["login | signIn | signin | authenticate"]);
    }

    const result = await login({ email, password });
    return res.status(200).json(result ?? { ok: true });
  })
);

// password.service.js REAL:
// - createPasswordResetToken(email)
// - resetPasswordWithToken({ token, newPassword })

router.post(
  "/password/forgot",
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email) return badRequest(res, "Email é obrigatório.");

    const createToken = pickFn(PasswordService, ["createPasswordResetToken"]);
    if (!createToken) {
      return serviceMissing(res, "password.service.js", ["createPasswordResetToken(email)"]);
    }

    try { await createToken(email); } catch {}
    return res.status(200).json({
      ok: true,
      message: "Se o email existir, enviaremos instruções para redefinir a senha.",
    });
  })
);

router.post(
  "/password/reset",
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return badRequest(res, "token e newPassword são obrigatórios.");

    const resetWithToken = pickFn(PasswordService, ["resetPasswordWithToken"]);
    if (!resetWithToken) {
      return serviceMissing(res, "password.service.js", ["resetPasswordWithToken({ token, newPassword })"]);
    }

    const result = await resetWithToken({ token, newPassword });
    return res.status(200).json(result ?? { ok: true });
  })
);

router.all(
  "/email/verify",
  asyncHandler(async (req, res) => {
    const token = (req.query?.token ?? req.body?.token ?? "").toString().trim();
    if (!token) return badRequest(res, "token é obrigatório.");

    const verify = pickFn(EmailVerificationService, ["verifyEmailWithToken", "verifyEmailToken", "verifyEmail", "confirmEmail"]);
    if (!verify) {
      return serviceMissing(res, "emailVerification.service.js", ["verifyEmailWithToken | verifyEmailToken | verifyEmail | confirmEmail"]);
    }

    let result;
    try { result = await verify(token); }
    catch { result = await verify({ token }); }

    return res.status(200).json(result ?? { ok: true });
  })
);

router.post(
  "/email/resend",
  asyncHandler(async (req, res) => {
    const { email, userId } = req.body || {};
    if (!email && !userId) return badRequest(res, "Informe email ou userId.");

    const resend = pickFn(EmailVerificationService, ["resendVerificationEmail", "resendEmailVerification", "sendVerificationEmail"]);
    if (!resend) {
      return serviceMissing(res, "emailVerification.service.js", ["resendVerificationEmail | resendEmailVerification | sendVerificationEmail"]);
    }

    let result;
    try { result = await resend({ email, userId }); }
    catch { result = email ? await resend(email) : await resend(userId); }

    return res.status(200).json(result ?? { ok: true });
  })
);

export const authRouter = router;
export default router;
