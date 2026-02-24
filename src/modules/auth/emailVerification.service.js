import crypto from "crypto";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function generateEmailVerification(userId) {
  const token = generateToken();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `
    UPDATE users
    SET email_verification_token = $1,
        email_verification_expires = $2
    WHERE id = $3
    `,
    [token, expires, userId]
  );

  return token;
}

export async function verifyEmail(token) {
  const result = await pool.query(
    `
    SELECT id FROM users
    WHERE email_verification_token = $1
      AND email_verification_expires > NOW()
    `,
    [token]
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError("Token inválido ou expirado", 400);
  }

  await pool.query(
    `
    UPDATE users
    SET email_verified = true,
        email_verification_token = NULL,
        email_verification_expires = NULL
    WHERE id = $1
    `,
    [user.id]
  );

  return { message: "E-mail verificado com sucesso." };
}
