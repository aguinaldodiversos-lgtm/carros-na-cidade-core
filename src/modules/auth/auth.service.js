// src/modules/auth/auth.service.js

import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "./jwt.strategy.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

export async function login(email, password) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
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
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

export async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AppError("Refresh token não fornecido", 401);
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);

    const payload = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    return {
      accessToken: generateAccessToken(payload),
    };
  } catch (err) {
    throw new AppError("Refresh token inválido ou expirado", 401);
  }
}
