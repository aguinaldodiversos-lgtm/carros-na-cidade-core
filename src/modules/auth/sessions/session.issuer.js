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
 * Emite um par (access + refresh) e grava o refresh no DB com hash.
 * Também grava token puro na coluna "token" por compat (pode remover depois).
 */
export async function issueSession(user, meta = {}) {
  if (!user?.id) throw new Error("Usuário inválido");

  const accessToken = signAccessToken(user);

  const familyId = crypto.randomUUID(); // família nova no login
  const jti = newJti();
  const refreshToken = signRefreshToken({ userId: user.id, familyId, jti });

  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = refreshExpiresAt();

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, token_hash, expires_at, revoked, created_at, family_id, created_ip, user_agent)
    VALUES ($1, $2, $3, $4, false, now(), $5, $6, $7)
    `,
    [
      user.id,
      refreshToken,              // compat: mantém token puro por enquanto
      tokenHash,                 // o que usaremos de verdade
      expiresAt,
      familyId,
      meta.ip || null,
      meta.userAgent || null,
    ]
  );

  return { accessToken, refreshToken };
}
