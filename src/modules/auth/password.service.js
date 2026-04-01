// src/modules/auth/password.service.js
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
const RESET_TOKEN_BYTES = Number(process.env.PASSWORD_RESET_TOKEN_BYTES || 32);
const RESET_TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MIN || 60);

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
}

async function getQuery() {
  const DbNS = await import("../../infrastructure/database/db.js");
  const mod = DbNS?.default ?? DbNS;

  const q =
    (typeof DbNS.query === "function" && DbNS.query.bind(DbNS)) ||
    (typeof mod?.query === "function" && mod.query.bind(mod)) ||
    (typeof DbNS.pool?.query === "function" && DbNS.pool.query.bind(DbNS.pool)) ||
    (typeof mod?.pool?.query === "function" && mod.pool.query.bind(mod.pool)) ||
    null;

  if (!q) {
    throw new Error(
      "[password.service] Database export não encontrado. Esperado query() ou pool.query()."
    );
  }
  return q;
}

/**
 * NOVO (principal): cria token e persiste em users.reset_token / users.reset_token_expires
 * - não vaza se o email existe
 * - guarda HASH do token no banco
 */
export async function createPasswordResetToken(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new AppError("Email é obrigatório.", 400);

  const query = await getQuery();

  try {
    const { rows } = await query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [
      normalized,
    ]);

    // não enumerar usuários
    if (!rows?.length) return { ok: true };

    const token = generateToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

    await query(
      `UPDATE users
         SET reset_token = $1,
             reset_token_expires = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, rows[0].id]
    );

    // TODO: Integrar com serviço de e-mail para enviar o token ao usuário.
    // O token NÃO deve ser retornado na resposta HTTP (vetor de ataque).
    // Exemplo: await emailService.sendPasswordReset(normalized, token, expiresAt);
    logger?.info?.({ userId: rows[0].id }, "[password.service] reset token gerado");

    // Retorna apenas ok: true — o token fica no banco e deve chegar ao usuário via e-mail.
    return { ok: true };
  } catch (err) {
    logger?.error?.({ err }, "[password.service] createPasswordResetToken failed");
    return { ok: true };
  }
}

/**
 * NOVO (principal): reseta senha via token
 * - aceita token cru (hash + compara com reset_token)
 */
export async function resetPasswordWithToken({ token, newPassword }) {
  const t = String(token || "").trim();
  const pwd = String(newPassword || "").trim();

  if (!t) throw new AppError("token é obrigatório.", 400);
  if (!pwd) throw new AppError("newPassword é obrigatório.", 400);
  if (pwd.length < 8) throw new AppError("Senha muito curta (mínimo 8).", 400);

  const query = await getQuery();

  const tokenHash = sha256(t);
  const passwordHash = await bcrypt.hash(pwd, SALT_ROUNDS);

  const { rows } = await query(
    `UPDATE users
        SET password = $1,
            reset_token = NULL,
            reset_token_expires = NULL
      WHERE reset_token = $2
        AND reset_token_expires IS NOT NULL
        AND reset_token_expires > NOW()
      RETURNING id`,
    [passwordHash, tokenHash]
  );

  if (!rows?.length) throw new AppError("Token inválido ou expirado.", 400);
  return { ok: true };
}

/** COMPAT (antigo): requestPasswordReset(email) */
export async function requestPasswordReset(email) {
  return createPasswordResetToken(email);
}

/** COMPAT (antigo): resetPassword(token, newPassword) OU resetPassword({token,newPassword}) */
export async function resetPassword(tokenOrObj, newPassword) {
  if (typeof tokenOrObj === "object" && tokenOrObj) {
    return resetPasswordWithToken({
      token: tokenOrObj.token,
      newPassword: tokenOrObj.newPassword,
    });
  }
  return resetPasswordWithToken({ token: tokenOrObj, newPassword });
}
