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
 * Emite um par (access + refresh) e grava o refresh no DB.
 *
 * Correções aplicadas:
 * 1. token_hash agora é gravado corretamente (não mais descartado).
 * 2. family_id pode ser recebido como parâmetro para preservar a família
 *    durante a rotação de tokens (evitar criação de nova família a cada refresh).
 * 3. O token puro ainda é armazenado em `token` para compatibilidade com
 *    buscas legadas — mas a busca primária deve usar token_hash.
 *
 * @param {object} user - Objeto com pelo menos { id }
 * @param {object} meta - Metadados da requisição (ip, userAgent)
 * @param {object} options - Opções adicionais
 * @param {string} [options.familyId] - ID de família existente (para rotação)
 */
export async function issueSession(user, meta = {}, { familyId } = {}) {
  if (!user?.id) throw new Error("Usuário inválido");

  const accessToken = signAccessToken(user);

  // Preserva familyId na rotação; cria novo apenas no login inicial
  const resolvedFamilyId = familyId || crypto.randomUUID();
  const jti = newJti();
  const refreshToken = signRefreshToken({ userId: user.id, familyId: resolvedFamilyId, jti });

  // Grava o hash do refresh token no banco — nunca o token puro como única cópia
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = refreshExpiresAt();

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, token_hash, family_id, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [user.id, refreshToken, tokenHash, resolvedFamilyId, expiresAt]
  );

  return { accessToken, refreshToken };
}
