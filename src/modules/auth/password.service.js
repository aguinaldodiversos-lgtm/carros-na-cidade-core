// src/modules/auth/password.service.js
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

/**
 * Gera token seguro e salva no usuário.
 * Requer colunas:
 * - reset_token TEXT
 * - reset_token_expires TIMESTAMP
 *
 * Observação: se você preferir não salvar token em texto puro,
 * guarde o hash do token (mais seguro). Aqui eu já salvo hash.
 */

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function createPasswordResetToken(email) {
  const client = await pool.connect();

  try {
    const tokenPlain = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(tokenPlain);

    const expiresMinutes = Number(process.env.RESET_TOKEN_EXPIRES_MIN || 30);
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    const { rowCount } = await client.query(
      `
      UPDATE users
      SET reset_token = $1,
          reset_token_expires = $2
      WHERE email = $3
      `,
      [tokenHash, expiresAt, email]
    );

    // Não revelar se o email existe (anti-enumeração)
    return {
      ok: true,
      // Para você testar localmente caso ainda não tenha email configurado
      token: rowCount ? tokenPlain : null,
      expiresAt,
    };
  } catch (err) {
    logger.error({ message: "Erro criando reset token", error: err?.message || String(err) });
    throw err;
  } finally {
    client.release();
  }
}

export async function resetPasswordWithToken({ token, newPassword }) {
  const client = await pool.connect();

  try {
    const tokenHash = sha256(token);

    const { rows } = await client.query(
      `
      SELECT id
      FROM users
      WHERE reset_token = $1
        AND reset_token_expires IS NOT NULL
        AND reset_token_expires > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

    if (!rows.length) {
      return { ok: false, error: "Token inválido ou expirado" };
    }

    const userId = rows[0].id;
    const passwordHash = await bcrypt.hash(String(newPassword), 10);

    await client.query(
      `
      UPDATE users
      SET password = $1,
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE id = $2
      `,
      [passwordHash, userId]
    );

    return { ok: true };
  } catch (err) {
    logger.error({ message: "Erro resetando senha", error: err?.message || String(err) });
    throw err;
  } finally {
    client.release();
  }
}
