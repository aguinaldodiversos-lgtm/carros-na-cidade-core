import crypto from "crypto";
import { pool } from "../../../infrastructure/database/db.js";
import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { signAccessToken, signRefreshToken, newJti } from "../token/token.signer.js";
import { hashRefreshToken } from "../token/token.hash.js";

const DEFAULT_REFRESH_TTL_DAYS = 30;

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function refreshExpiresAt() {
  const ttlDays = parsePositiveNumber(process.env.REFRESH_TOKEN_TTL_DAYS, DEFAULT_REFRESH_TTL_DAYS);

  const date = new Date();
  date.setDate(date.getDate() + ttlDays);
  return date;
}

function normalizeUserId(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new AppError("Usuário inválido", 400);
  }
  return normalized;
}

export async function issueSession(user, meta = {}) {
  const userId = normalizeUserId(user?.id);

  const accessToken = signAccessToken(user);

  const familyId = normalizeString(meta?.familyId) || crypto.randomUUID();
  const jti = newJti();
  const refreshToken = signRefreshToken({
    userId,
    familyId,
    jti,
  });

  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = refreshExpiresAt();

  await pool.query(
    `
    INSERT INTO refresh_tokens (
      user_id,
      token,
      token_hash,
      expires_at,
      revoked,
      created_at,
      family_id,
      created_ip,
      user_agent
    )
    VALUES ($1, $2, $3, $4, false, NOW(), $5, $6, $7)
    `,
    [
      userId,
      refreshToken,
      tokenHash,
      expiresAt,
      familyId,
      normalizeString(meta?.ip) || null,
      normalizeString(meta?.userAgent) || null,
    ]
  );

  return {
    accessToken,
    refreshToken,
  };
}

export default issueSession;
