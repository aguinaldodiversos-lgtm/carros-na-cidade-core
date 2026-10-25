import crypto from "crypto";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { sendEmailVerificationEmail } from "../../services/email.service.js";

const TOKEN_TTL_HOURS = 24;
const RESEND_COOLDOWN_MINUTES = 2;

function tokenHash(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * O endpoint de reenvio usa apenas o id obtido da sessão autenticada.
 * O hash do token, nunca o token utilizável, fica no banco.
 */
export async function sendVerificationEmailForUser(userId) {
  const found = await pool.query(
    `SELECT id, email, email_verified_at, email_verification_last_sent_at
       FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const account = found.rows[0];
  if (!account) throw new AppError("Conta não encontrada.", 404);
  if (account.email_verified_at) return { ok: true, already_verified: true };

  const recent = account.email_verification_last_sent_at;
  if (
    recent &&
    Date.now() - new Date(recent).getTime() < RESEND_COOLDOWN_MINUTES * 60 * 1000
  ) {
    throw new AppError("Aguarde dois minutos antes de solicitar outro e-mail.", 429);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hash = tokenHash(rawToken);
  const result = await pool.query(
    `UPDATE users
       SET email_verification_token = $2,
           email_verification_expires = NOW() + INTERVAL '24 hours',
           email_verification_last_sent_at = NOW()
       WHERE id = $1
         AND email_verified_at IS NULL
         AND (
           email_verification_last_sent_at IS NULL
           OR email_verification_last_sent_at <= NOW() - INTERVAL '2 minutes'
         )
       RETURNING id`,
    [userId, hash]
  );
  if (!result.rowCount) {
    throw new AppError("Aguarde dois minutos antes de solicitar outro e-mail.", 429);
  }
  const delivered = await sendEmailVerificationEmail(account.email, rawToken);
  return { ok: true, sent: delivered === true, expires_in_hours: TOKEN_TTL_HOURS };
}

/** Confirma uma única vez; nunca aceita identidade de conta fornecida pelo cliente. */
export async function verifyEmail(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new AppError("Token inválido ou expirado.", 400);
  }
  const result = await pool.query(
    `UPDATE users
       SET email_verified = TRUE,
           is_email_verified = TRUE,
           email_verified_at = NOW(),
           email_verification_token = NULL,
           email_verification_expires = NULL
       WHERE email_verification_token = $1
         AND email_verification_expires > NOW()
         AND email_verified_at IS NULL
       RETURNING id`,
    [tokenHash(token)]
  );
  if (!result.rowCount) throw new AppError("Token inválido ou expirado.", 400);
  return { ok: true, message: "E-mail confirmado com sucesso." };
}
