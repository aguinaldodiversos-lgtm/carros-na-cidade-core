// src/modules/auth/token/token.hash.js
import crypto from "crypto";

const PEPPER = process.env.REFRESH_TOKEN_PEPPER || "";

export function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

/**
 * Hash forte (com pepper) para não armazenar refresh token puro no banco.
 * Mesmo se o DB vazar, o token não é reaproveitável.
 */
export function hashRefreshToken(refreshToken) {
  if (!refreshToken) return null;
  return sha256(`${refreshToken}:${PEPPER}`);
}
