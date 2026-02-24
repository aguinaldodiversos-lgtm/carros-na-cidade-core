// src/modules/auth/auth.service.js

import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import { verifyRefreshToken } from "./jwt.strategy.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

import { logLoginAttempt } from "./auth.audit.service.js";
import {
  validateUserForLogin,
  handleFailedLogin,
  resetLoginAttempts,
} from "./auth.security.service.js";
import { createSession } from "./auth.session.service.js";

/* =====================================================
   LOGIN
===================================================== */

export async function login(email, password, reqMeta = {}) {
  if (!email || !password) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [normalizedEmail]
  );

  const user = result.rows[0];

  await validateUserForLogin(user);

  const passwordValid = await bcrypt.compare(password, user.password);

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

  return await createSession(user);
}

/* =====================================================
   REFRESH
===================================================== */

export async function refresh(oldRefreshToken) {
  if (!oldRefreshToken) {
    throw new AppError("Refresh token não fornecido", 401);
  }

  const stored = await pool.query(
    "SELECT * FROM refresh_tokens WHERE token = $1",
    [oldRefreshToken]
  );

  const tokenRow = stored.rows[0];

  if (!tokenRow || tokenRow.revoked) {
    throw new AppError("Refresh token inválido", 401);
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    throw new AppError("Refresh token expirado", 401);
  }

  let decoded;

  try {
    decoded = verifyRefreshToken(oldRefreshToken);
  } catch {
    throw new AppError("Refresh token inválido", 401);
  }

  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token = $1`,
    [oldRefreshToken]
  );

  const userResult = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [decoded.id]
  );

  return await createSession(userResult.rows[0]);
}

/* =====================================================
   LOGOUT
===================================================== */

export async function logout(refreshToken) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token = $1`,
    [refreshToken]
  );

  return { message: "Logout realizado com sucesso" };
}

export async function logoutAll(userId) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`,
    [userId]
  );

  return { message: "Todas as sessões foram encerradas" };
}
