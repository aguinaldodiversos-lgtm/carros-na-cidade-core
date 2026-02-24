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
   CONFIGURAÇÕES
===================================================== */

const REFRESH_TOKEN_DAYS = 7;
const MAX_ACTIVE_SESSIONS = 5; // limite por usuário

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/* =====================================================
   LOGIN
===================================================== */

export async function login(email, password) {
  if (!email || !password) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const normalizedEmail = normalizeEmail(email);

  const result = await pool.query(
    "SELECT id, email, password, role, plan FROM users WHERE email = $1",
    [normalizedEmail]
  );

  const user = result.rows[0];

  // Mensagem genérica para evitar enumeração
  if (!user) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || "user",
    plan: user.plan || "free",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  /* ===============================
     Controle de sessões simultâneas
  =============================== */

  const activeSessions = await pool.query(
    `
    SELECT COUNT(*) 
    FROM refresh_tokens
    WHERE user_id = $1
      AND revoked = false
    `,
    [user.id]
  );

  if (Number(activeSessions.rows[0].count) >= MAX_ACTIVE_SESSIONS) {
    await pool.query(
      `
      DELETE FROM refresh_tokens
      WHERE user_id = $1
      AND id IN (
        SELECT id FROM refresh_tokens
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT 1
      )
      `,
      [user.id]
    );
  }

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    `,
    [user.id, refreshToken, addDays(REFRESH_TOKEN_DAYS)]
  );

  return {
    accessToken,
    refreshToken,
  };
}

/* =====================================================
   REFRESH COM ROTAÇÃO SEGURA
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

  /* ===============================
     ROTAÇÃO (ANTI REPLAY)
  =============================== */

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
    [decoded.id, newRefreshToken, addDays(REFRESH_TOKEN_DAYS)]
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/* =====================================================
   LOGOUT (REVOGAÇÃO INDIVIDUAL)
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
   LOGOUT GLOBAL (TODAS SESSÕES)
===================================================== */

export async function logoutAll(userId) {
  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked = true
    WHERE user_id = $1
    `,
    [userId]
  );

  return {
    message: "Todas as sessões foram encerradas",
  };
}

/* =====================================================
   LIMPEZA DE TOKENS EXPIRADOS
===================================================== */

export async function cleanupExpiredTokens() {
  await pool.query(
    `
    DELETE FROM refresh_tokens
    WHERE expires_at < NOW()
    `
  );
}
