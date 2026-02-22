// src/modules/auth/auth.service.js

import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "./jwt.strategy.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export async function login(email, password) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];
  if (!user) throw new AppError("Usuário não encontrado", 401);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new AppError("Senha inválida", 401);

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || "user",
    plan: user.plan || "free",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, refreshToken, addDays(7)]
  );

  return { accessToken, refreshToken };
}

export async function refresh(oldToken) {
  if (!oldToken)
    throw new AppError("Refresh token não fornecido", 401);

  const dbToken = await pool.query(
    `SELECT * FROM refresh_tokens
     WHERE token = $1 AND revoked = false`,
    [oldToken]
  );

  if (!dbToken.rows.length)
    throw new AppError("Refresh inválido", 401);

  let decoded;
  try {
    decoded = verifyRefreshToken(oldToken);
  } catch {
    throw new AppError("Refresh expirado", 401);
  }

  // Revoga o token antigo (rotação)
  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token = $1`,
    [oldToken]
  );

  const payload = {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    plan: decoded.plan,
  };

  const newAccess = generateAccessToken(payload);
  const newRefresh = generateRefreshToken(payload);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)`,
    [decoded.id, newRefresh, addDays(7)]
  );

  return {
    accessToken: newAccess,
    refreshToken: newRefresh,
  };
}

export async function logout(refreshToken) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token = $1`,
    [refreshToken]
  );
}
