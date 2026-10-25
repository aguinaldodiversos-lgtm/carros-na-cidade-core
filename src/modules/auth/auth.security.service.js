// src/modules/auth/auth.security.service.js

import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;

export async function validateUserForLogin(user) {
  if (!user) {
    throw new AppError("Credenciais inválidas", 401);
  }

  // Cadastro e publicação seguem liberados; confirmação de e-mail é
  // informação de confiança, não uma barreira para fazer login.

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError("Conta temporariamente bloqueada. Tente novamente mais tarde.", 403);
  }
}

export async function handleFailedLogin(user) {
  const attempts = (user.failed_attempts || 0) + 1;

  let lockTime = null;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    lockTime = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
  }

  await pool.query(
    `
    UPDATE users
    SET failed_attempts = $1,
        locked_until = $2
    WHERE id = $3
    `,
    [attempts, lockTime, user.id]
  );
}

export async function resetLoginAttempts(userId) {
  await pool.query(
    `
    UPDATE users
    SET failed_attempts = 0,
        locked_until = NULL
    WHERE id = $1
    `,
    [userId]
  );
}
