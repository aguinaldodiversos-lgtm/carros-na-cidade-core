import express from "express";
import { loginRateLimit } from "../../shared/middlewares/rateLimit.middleware.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { pool } from "../../infrastructure/database/db.js";

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
  throw new AppError(
    `Método esperado não encontrado em ${serviceName}: ${candidates.join(" | ")}`,
    500,
    false
  );
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireString(value, fieldName, { lowercase = false } = {}) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new AppError(`Campo obrigatório: ${fieldName}`, 400);
  return lowercase ? normalized.toLowerCase() : normalized;
}

/** LOGIN */
router.post(
  "/login",
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const email = requireString(req.body?.email, "email", { lowercase: true });
    const password = requireString(req.body?.password, "password");

    const login = ensureFn(
      AuthService,
      ["login", "signIn", "signin", "authenticate"],
      "auth.service.js"
    );

    const meta = {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
      requestId: req.requestId,
    };

    const result = await login(email, password, meta);

    return res.status(200).json(result);
  })
);

/** REFRESH */
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = requireString(req.body?.refreshToken, "refreshToken");
    const refresh = ensureFn(AuthService, ["refresh"], "auth.service.js");
    const meta = {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
      requestId: req.requestId,
    };

    const result = await refresh(refreshToken, meta);

    return res.status(200).json(result);
  })
);

/** LOGOUT */
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = String(req.body?.refreshToken ?? "").trim() || null;
    const logout = ensureFn(AuthService, ["logout"], "auth.service.js");
    const result = await logout(refreshToken);
    return res.status(200).json(result ?? { ok: true });
  })
);

/** REGISTER */
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const email = requireString(req.body?.email, "email", { lowercase: true });
    const password = requireString(req.body?.password, "password");
    const name = String(req.body?.name ?? "").trim() || null;
    const phone = String(req.body?.phone ?? "").trim() || null;
    const city = String(req.body?.city ?? "").trim() || null;
    const document_type = ["cpf", "cnpj"].includes(
      String(req.body?.document_type ?? "").toLowerCase()
    )
      ? String(req.body.document_type).toLowerCase()
      : null;
    const document_number = req.body?.document_number
      ? String(req.body.document_number).replace(/\D/g, "") || null
      : null;

    const register = ensureFn(
      AuthService,
      ["register", "signUp", "signup", "createUser", "createAccount"],
      "auth.service.js"
    );

    const meta = {
      ip: req.ip,
      userAgent: req.headers["user-agent"] || null,
      requestId: req.requestId,
    };

    const result = await register(
      { name, email, password, phone, city, document_type, document_number },
      meta
    );

    return res.status(201).json(result ?? { ok: true });
  })
);

/** VERIFY DOCUMENT (CPF/CNPJ) */
router.post(
  "/verify-document",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const document_type = requireString(req.body?.document_type, "document_type").toLowerCase();
    const document_number = requireString(req.body?.document_number, "document_number").replace(
      /\D/g,
      ""
    );

    if (!["cpf", "cnpj"].includes(document_type)) {
      throw new AppError("Tipo de documento inválido. Use cpf ou cnpj.", 400);
    }

    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const { verifyDocument } = require("../../services/documents/documentVerification.service.js");

    const result = await verifyDocument({
      type: document_type,
      number: document_number,
    });

    if (!result.valid) {
      throw new AppError("Documento inválido.", 400);
    }

    const dup = await pool.query(
      `
      SELECT id FROM users
      WHERE document_number = $1
        AND id::text <> $2::text
      LIMIT 1
      `,
      [document_number, String(req.user.id)]
    );
    if (dup.rows?.length) {
      throw new AppError("Este documento já está cadastrado em outra conta.", 409);
    }

    const displayName = String(req.body?.name ?? "").trim();

    await pool.query(
      `
      UPDATE users
      SET
        document_type = $1,
        document_number = $2,
        document_verified = true,
        name = COALESCE(NULLIF($4, ''), name)
      WHERE id = $3
      `,
      [document_type, document_number, req.user.id, displayName]
    );

    return res.status(200).json({
      success: true,
      message: "Documento verificado com sucesso.",
      company_name: result.company_name || null,
    });
  })
);

/** PASSWORD RESET */
async function handleForgotPassword(req, res) {
  const email = requireString(req.body?.email, "email", { lowercase: true });
  const fn = ensureFn(
    PasswordService,
    ["createPasswordResetToken", "requestPasswordReset"],
    "password.service.js"
  );

  try {
    await fn(email);
  } catch {
    // não enumerar usuários
  }

  return res.status(200).json({
    ok: true,
    message: "Se o email existir, enviaremos instruções para redefinir a senha.",
  });
}

router.post("/forgot-password", asyncHandler(handleForgotPassword));
router.post("/password/forgot", asyncHandler(handleForgotPassword));

async function handleResetPassword(req, res) {
  const token = requireString(req.body?.token, "token");
  const newPassword = requireString(req.body?.newPassword, "newPassword");

  const fn = ensureFn(
    PasswordService,
    ["resetPasswordWithToken", "resetPassword"],
    "password.service.js"
  );

  const result = fn.length >= 2 ? await fn(token, newPassword) : await fn({ token, newPassword });

  return res.status(200).json(result ?? { ok: true });
}

router.post("/reset-password", asyncHandler(handleResetPassword));
router.post("/password/reset", asyncHandler(handleResetPassword));

/** EMAIL VERIFY */
async function handleVerifyEmail(req, res) {
  const token = requireString(req.body?.token ?? req.query?.token, "token");

  const verify = ensureFn(
    EmailVerificationService,
    ["verifyEmailWithToken", "verifyEmailToken", "verifyEmail", "confirmEmail"],
    "emailVerification.service.js"
  );

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

/** EMAIL RESEND */
router.post(
  "/email/resend",
  asyncHandler(async (req, res) => {
    const resend = pickFn(EmailVerificationService, [
      "resendVerificationEmail",
      "resendEmailVerification",
      "sendVerificationEmail",
    ]);

    if (!resend) {
      return res.status(501).json({ ok: false, error: "Resend não implementado no service." });
    }

    const { email, userId } = req.body || {};
    if (!email && !userId) throw new AppError("Informe email ou userId.", 400);

    let result;
    try {
      result = await resend({ email, userId });
    } catch {
      result = email ? await resend(email) : await resend(userId);
    }

    return res.status(200).json(result ?? { ok: true });
  })
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        document_type,
        COALESCE(document_verified, false) AS document_verified,
        COALESCE(plan, 'free') AS plan,
        role
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    const user = result.rows[0];
    if (!user) {
      throw new AppError("Usuario nao encontrado", 404);
    }

    const rawDoc = user.document_type;
    const hasDoc = rawDoc != null && String(rawDoc).trim() !== "";
    const accountType = !hasDoc
      ? "pending"
      : String(rawDoc).trim().toLowerCase() === "cnpj"
        ? "CNPJ"
        : "CPF";

    res.json({
      success: true,
      user: {
        id: String(user.id),
        name: user.name?.trim() || "Usuario",
        email: user.email?.trim() || "",
        type: accountType,
        document_type: hasDoc ? String(rawDoc).trim().toLowerCase() : null,
        cnpj_verified: accountType === "CNPJ" ? Boolean(user.document_verified) : false,
        role: user.role || "user",
        plan: user.plan || "free",
      },
    });
  })
);

export const authRouter = router;
export default router;
