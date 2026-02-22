// src/modules/auth/auth.service.js

import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "./jwt.strategy.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

/* =====================================================
   UTIL
===================================================== */

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/* =====================================================
   LOGIN
===================================================== */

export async function login(email, password) {
  const result = await pool.query(
    "SELECT id, email, password, role, plan FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError("Usuário não encontrado", 401);
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    throw new AppError("Senha inválida", 401);
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || "user",
    plan: user.plan || "free",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    `,
    [user.id, refreshToken, addDays(7)]
  );

  return {
    accessToken,
    refreshToken,
  };
}

/* =====================================================
   REFRESH COM ROTAÇÃO AUTOMÁTICA
===================================================== */

export async function refresh(oldRefreshToken) {
  if (!oldRefreshToken) {
    throw new AppError("Refresh token não fornecido", 401);
  }

  const storedToken = await pool.query(
    `
    SELECT * FROM refresh_tokens
    WHERE token = $1
    `,
    [oldRefreshToken]
  );

  const tokenRow = storedToken.rows[0];

  if (!tokenRow) {
    throw new AppError("Refresh token inválido", 401);
  }

  if (tokenRow.revoked) {
    throw new AppError("Refresh token revogado", 401);
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

  // Revoga token antigo (BLACKLIST + ROTAÇÃO)
  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked = true
    WHERE token = $1
    `,
    [oldRefreshToken]
  );

  const payload = {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    plan: decoded.plan,
  };

  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    `,
    [decoded.id, newRefreshToken, addDays(7)]
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/* =====================================================
   LOGOUT
===================================================== */

export async function logout(refreshToken) {
  if (!refreshToken) {
    throw new AppError("Refresh token não fornecido", 400);
  }

  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked = true
    WHERE token = $1
    `,
    [refreshToken]
  );

  return {
    message: "Logout realizado com sucesso",
  };
}

/* =====================================================
   LIMPEZA DE TOKENS EXPIRADOS (manutenção futura)
===================================================== */

export async function cleanupExpiredTokens() {
  await pool.query(
    `
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW()
    `
  );
}
