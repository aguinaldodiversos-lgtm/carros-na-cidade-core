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
