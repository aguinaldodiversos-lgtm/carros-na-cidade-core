// src/modules/auth/token/token.signer.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AppError } from "../../../shared/middlewares/error.middleware.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET) throw new Error("JWT_SECRET não definido no ambiente");
if (!JWT_REFRESH_SECRET) throw new Error("JWT_REFRESH_SECRET não definido no ambiente");

const ACCESS_TTL_MIN = Number(process.env.ACCESS_TOKEN_TTL_MIN || 15);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

export function signAccessToken(user) {
  if (!user?.id) throw new AppError("Usuário inválido", 400);

  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TTL_MIN}m` }
  );
}

export function signRefreshToken(payload) {
  // payload: { userId, familyId, jti }
  if (!payload?.userId) throw new AppError("Payload inválido", 400);

  return jwt.sign(
    {
      id: payload.userId,
      familyId: payload.familyId,
      jti: payload.jti,
      typ: "refresh",
    },
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TTL_DAYS}d` }
  );
}

export function verifyRefreshToken(refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    if (decoded?.typ !== "refresh") throw new Error("Token inválido");
    return decoded;
  } catch {
    throw new AppError("Refresh token inválido", 401);
  }
}

export function newJti() {
  return crypto.randomUUID();
}
