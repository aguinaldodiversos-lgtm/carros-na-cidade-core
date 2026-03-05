// src/modules/auth/password.service.js
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

/**
 * Segurança:
 * - Token nunca é salvo em texto puro no banco (hash SHA-256)
 * - Expiração curta e tentativa única
 *
 * Requisitos no DB (tabela sugerida):
 * password_resets (
 *   id SERIAL PK,
 *   user_id INT NOT NULL,
 *   token_hash TEXT NOT NULL,
 *   expires_at TIMESTAMP NOT NULL,
 *   used_at TIMESTAMP NULL,
 *   created_at TIMESTAMP DEFAULT NOW()
 * )
 */
async function ensurePasswordResetTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON password_resets(token_hash);
  `);
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

/**
 * Export esperado pelo auth.routes.js:
 * - requestPasswordReset(email)
 * - resetPasswordWithToken({ token, newPassword })
 */

export async function requestPasswordReset(email) {
  const safeEmail = String(email || "").trim().toLowerCase();
  if (!safeEmail) {
    return { ok: true }; // não vaza existência do usuário
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensurePasswordResetTable(client);

    const userRes = await client.query(
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [safeEmail]
    );

    if (userRes.rowCount === 0) {
      await client.query("COMMIT");
      return { ok: true }; // resposta idêntica
    }

    const user = userRes.rows[0];

    // opcional: invalidar tokens anteriores ainda válidos
    await client.query(
      `UPDATE password_resets SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [user.id]
    );

    const token = generateToken();
    const tokenHash = sha256(token);

    const expiresMinutes = Number(process.env.PASSWORD_RESET_EXPIRES_MIN || 60);
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

    await client.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    await client.query("COMMIT");

    // aqui você dispara email (Resend) em outro service/camada.
    // retornamos token APENAS para ambiente dev/test local se quiser.
    const exposeToken = String(process.env.EXPOSE_RESET_TOKEN || "false").toLowerCase() === "true";

    logger.info({
      msg: "Password reset solicitado",
      userId: user.id,
      email: user.email,
      expiresMinutes,
    });

    return exposeToken ? { ok: true, token } : { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ msg: "Erro requestPasswordReset", error: err?.message || String(err) });
    // resposta segura
    return { ok: true };
  } finally {
    client.release();
  }
}

export async function resetPasswordWithToken({ token, newPassword }) {
  const rawToken = String(token || "").trim();
  const pwd = String(newPassword || "");

  if (!rawToken || pwd.length < 6) {
    return { ok: false, error: "Token ou senha inválidos" };
  }

  const tokenHash = sha256(rawToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensurePasswordResetTable(client);

    const resetRes = await client.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_resets
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (resetRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Token inválido ou expirado" };
    }

    const row = resetRes.rows[0];

    const expired = new Date(row.expires_at).getTime() < Date.now();
    const used = !!row.used_at;

    if (expired || used) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Token inválido ou expirado" };
    }

    const passwordHash = await bcrypt.hash(pwd, 10);

    await client.query(`UPDATE users SET password = $1 WHERE id = $2`, [
      passwordHash,
      row.user_id,
    ]);

    await client.query(
      `UPDATE password_resets SET used_at = NOW() WHERE id = $1`,
      [row.id]
    );

    await client.query("COMMIT");

    logger.info({ msg: "Senha redefinida com sucesso", userId: row.user_id });
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ msg: "Erro resetPasswordWithToken", error: err?.message || String(err) });
    return { ok: false, error: "Falha ao redefinir senha" };
  } finally {
    client.release();
  }
}
