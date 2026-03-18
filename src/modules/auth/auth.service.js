// src/modules/auth/auth.service.js
import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

import { logLoginAttempt } from "./auth.audit.service.js";
import {
  validateUserForLogin,
  handleFailedLogin,
  resetLoginAttempts,
} from "./auth.security.service.js";

import { issueSession } from "./sessions/session.issuer.js";
import {
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from "./sessions/refreshToken.repository.js";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

/* =====================================================
   REGISTER
===================================================== */
export async function register({ name, email, password, phone, city, document_type, document_number }, reqMeta = {}) {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const pwd = String(password ?? "").trim();

  if (!normalizedEmail) throw new AppError("Email é obrigatório.", 400);
  if (!pwd) throw new AppError("Senha é obrigatória.", 400);
  if (pwd.length < 6) throw new AppError("Senha deve ter no mínimo 6 caracteres.", 400);

  const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [normalizedEmail]);
  if (existing.rows?.length) {
    throw new AppError("Email já cadastrado.", 400);
  }

  const passwordHash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
  const nameVal = name ? String(name).trim() || null : null;

  const result = await pool.query(
    `INSERT INTO users (name, email, password, email_verified)
     VALUES ($1, $2, $3, true)
     RETURNING id, name, email, document_type, document_verified`,
    [nameVal, normalizedEmail, passwordHash]
  );

  const user = result.rows[0];
  if (!user) throw new AppError("Erro ao criar usuário.", 500);

  const phoneVal = phone ? String(phone).replace(/\D/g, "").slice(0, 11) || null : null;
  const cityVal = city ? String(city).trim() || null : null;
  const docType = document_type && ["cpf", "cnpj"].includes(String(document_type).toLowerCase())
    ? String(document_type).toLowerCase()
    : null;
  const docNum = document_number ? String(document_number).replace(/\D/g, "") || null : null;

  if (docType || docNum) {
    await pool.query(
      `UPDATE users SET document_type = COALESCE($1, document_type), document_number = COALESCE($2, document_number)
       WHERE id = $3`,
      [docType, docNum, user.id]
    ).catch(() => {});
  }

  return issueSession(user, reqMeta);
}

/* =====================================================
   LOGIN
===================================================== */
export async function login(email, password, reqMeta = {}) {
  if (!email || !password) throw new AppError("Credenciais inválidas", 401);

  const normalizedEmail = String(email).trim().toLowerCase();

  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    normalizedEmail,
  ]);
  const user = result.rows[0];

  await validateUserForLogin(user);

  const passwordValid = await bcrypt.compare(String(password), user.password);

  if (!passwordValid) {
    await handleFailedLogin(user);

    await logLoginAttempt({
      userId: user?.id,
      ip: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      success: false,
    });

    throw new AppError("Credenciais inválidas", 401);
  }

  await resetLoginAttempts(user.id);

  await logLoginAttempt({
    userId: user.id,
    ip: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    success: true,
  });

  return issueSession(user, reqMeta);
}

/* =====================================================
   REFRESH (ROTATION)
===================================================== */
export async function refresh(oldRefreshToken, reqMeta = {}) {
  if (!oldRefreshToken) throw new AppError("Refresh token não fornecido", 401);

  try {
    return await rotateRefreshToken(oldRefreshToken, reqMeta);
  } catch (err) {
    // Se detectar reuse attack, encerra tudo
    if (err?.code === "REFRESH_REUSE") {
      await revokeAllUserRefreshTokens(err.userId);
      throw new AppError("Sessão comprometida. Faça login novamente.", 401);
    }
    throw err;
  }
}

/* =====================================================
   LOGOUT
===================================================== */
export async function logout(refreshToken) {
  if (!refreshToken) return { message: "Logout realizado com sucesso" };

  await revokeRefreshToken(refreshToken);
  return { message: "Logout realizado com sucesso" };
}

export async function logoutAll(userId) {
  if (!userId) throw new AppError("userId obrigatório", 400);

  await revokeAllUserRefreshTokens(userId);
  return { message: "Todas as sessões foram encerradas" };
}
