// src/modules/auth/sessions/refreshToken.repository.js
import { pool } from "../../../infrastructure/database/db.js";
import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { verifyRefreshToken } from "../token/token.signer.js";
import { hashRefreshToken } from "../token/token.hash.js";
import { issueSession } from "./session.issuer.js";

/**
 * Regras enterprise:
 * - Refresh token é rotativo (rotation): cada refresh invalida o anterior e gera um novo.
 * - Se um refresh token revogado for reaproveitado => REFRESH_REUSE (possível roubo)
 * - Logout revoga por hash.
 */

export async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  if (!tokenHash) return;

  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked = true,
        revoked_at = COALESCE(revoked_at, now())
    WHERE token_hash = $1 OR token = $2
    `,
    [tokenHash, refreshToken]
  );
}

export async function revokeAllUserRefreshTokens(userId) {
  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked = true,
        revoked_at = COALESCE(revoked_at, now())
    WHERE user_id = $1 AND revoked = false
    `,
    [userId]
  );
}

/**
 * Rotation segura:
 * - Verifica JWT do refresh
 * - Busca no DB por token_hash (ou token legado)
 * - Se revogado => reuse attack
 * - Revoga token atual e emite um novo
 */
export async function rotateRefreshToken(oldRefreshToken, meta = {}) {
  const decoded = verifyRefreshToken(oldRefreshToken);
  const tokenHash = hashRefreshToken(oldRefreshToken);

  const { rows } = await pool.query(
    `
    SELECT *
    FROM refresh_tokens
    WHERE token_hash = $1 OR token = $2
    LIMIT 1
    `,
    [tokenHash, oldRefreshToken]
  );

  const tokenRow = rows[0];

  // Não existe no DB => inválido (ou já foi limpo)
  if (!tokenRow) throw new AppError("Refresh token inválido", 401);

  // Expirado
  if (new Date(tokenRow.expires_at) < new Date()) {
    throw new AppError("Refresh token expirado", 401);
  }

  // Reuse attack: token revogado sendo reutilizado
  if (tokenRow.revoked) {
    const err = new Error("REFRESH_REUSE");
    err.code = "REFRESH_REUSE";
    err.userId = tokenRow.user_id || decoded?.id;
    throw err;
  }

  // Revoga o token atual (rotation)
  await pool.query(
    `
    UPDATE refresh_tokens
    SET revoked = true,
        revoked_at = now(),
        rotated_at = now()
    WHERE id = $1
    `,
    [tokenRow.id]
  );

  // Carrega usuário e emite nova sessão
  const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [
    decoded.id,
  ]);
  const user = userRes.rows[0];
  if (!user) throw new AppError("Usuário inválido", 401);

  // Nova sessão (novo familyId por padrão no login; aqui a emissão cria nova família.
  // Se quiser manter mesma família no refresh, eu adapto para reaproveitar tokenRow.family_id)
  return issueSession(user, meta);
}
