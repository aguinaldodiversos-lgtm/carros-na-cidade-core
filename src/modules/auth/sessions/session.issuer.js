// src/modules/auth/sessions/session.issuer.js
import crypto from "crypto";
import { pool } from "../../../infrastructure/database/db.js";
import { signAccessToken, signRefreshToken, newJti } from "../token/token.signer.js";
import { hashRefreshToken } from "../token/token.hash.js";

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TTL_DAYS);
  return d;
}

/**
 * Emite um par (access + refresh) e grava o refresh no DB
 * no formato compatível com o schema atual.
 */
export async function issueSession(user, meta = {}) {
  if (!user?.id) throw new Error("Usuário inválido");

  const accessToken = signAccessToken(user);

  const familyId = crypto.randomUUID();
  const jti = newJti();
  const refreshToken = signRefreshToken({ userId: user.id, familyId, jti });

  // Mantidos por compatibilidade futura, mesmo que o schema atual não use
  hashRefreshToken(refreshToken);

  const expiresAt = refreshExpiresAt();

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES ($1, $2, $3)
    `,
    [user.id, refreshToken, expiresAt]
  );

  return { accessToken, refreshToken };
}
