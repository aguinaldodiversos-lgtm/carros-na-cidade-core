import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

export async function requestPasswordReset(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new AppError("Email inválido", 400);
  }

  const result = await pool.query(
    `SELECT id, email FROM users WHERE email = $1 LIMIT 1`,
    [normalizedEmail]
  );

  if (!result.rows.length) {
    return {
      success: true,
      message: "Se o email existir, o processo de recuperação foi iniciado.",
    };
  }

  const user = result.rows[0];
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await pool.query(
    `
    UPDATE users
    SET
      reset_token = $2,
      reset_token_expires = $3,
      updated_at = NOW()
    WHERE id = $1
    `,
    [user.id, token, expiresAt]
  );

  return {
    success: true,
    message: "Token de recuperação gerado com sucesso.",
    token,
    expiresAt,
  };
}

export async function resetPasswordWithToken({ token, newPassword }) {
  const safeToken = String(token || "").trim();
  const safePassword = String(newPassword || "").trim();

  if (!safeToken || !safePassword) {
    throw new AppError("Token e nova senha são obrigatórios", 400);
  }

  if (safePassword.length < 6) {
    throw new AppError("A senha deve ter pelo menos 6 caracteres", 400);
  }

  const result = await pool.query(
    `
    SELECT id, reset_token_expires
    FROM users
    WHERE reset_token = $1
    LIMIT 1
    `,
    [safeToken]
  );

  if (!result.rows.length) {
    throw new AppError("Token inválido ou expirado", 400);
  }

  const user = result.rows[0];

  if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
    throw new AppError("Token inválido ou expirado", 400);
  }

  const passwordHash = await bcrypt.hash(safePassword, 10);

  await pool.query(
    `
    UPDATE users
    SET
      password = $2,
      reset_token = NULL,
      reset_token_expires = NULL,
      updated_at = NOW()
    WHERE id = $1
    `,
    [user.id, passwordHash]
  );

  return {
    success: true,
    message: "Senha redefinida com sucesso.",
  };
}
