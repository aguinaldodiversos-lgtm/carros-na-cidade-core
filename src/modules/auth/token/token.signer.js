// src/modules/auth/token/token.signer.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AppError } from "../../../shared/middlewares/error.middleware.js";

const ALGORITHM = "HS256";
const DEFAULT_ISSUER = "carros-na-cidade";
const DEFAULT_AUDIENCE = "carros-na-cidade-users";
const DEFAULT_ACCESS_TTL_MIN = 15;
const DEFAULT_REFRESH_TTL_DAYS = 30;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getJwtConfig() {
  const jwtSecret = normalizeString(process.env.JWT_SECRET);
  const jwtRefreshSecret =
    normalizeString(process.env.JWT_REFRESH_SECRET) || jwtSecret;

  if (!jwtSecret) {
    throw new AppError("JWT_SECRET não definido no ambiente", 500);
  }

  if (!jwtRefreshSecret) {
    throw new AppError("JWT_REFRESH_SECRET não definido no ambiente", 500);
  }

  return {
    jwtSecret,
    jwtRefreshSecret,
    issuer: normalizeString(process.env.JWT_ISSUER) || DEFAULT_ISSUER,
    audience: normalizeString(process.env.JWT_AUDIENCE) || DEFAULT_AUDIENCE,
    accessTtlMin: parsePositiveNumber(
      process.env.ACCESS_TOKEN_TTL_MIN,
      DEFAULT_ACCESS_TTL_MIN
    ),
    refreshTtlDays: parsePositiveNumber(
      process.env.REFRESH_TOKEN_TTL_DAYS,
      DEFAULT_REFRESH_TTL_DAYS
    ),
  };
}

function normalizeUserId(userId) {
  const normalized = normalizeString(userId);
  if (!normalized) {
    throw new AppError("Usuário inválido", 400);
  }
  return normalized;
}

function normalizeEmail(email) {
  return normalizeString(email).toLowerCase();
}

function normalizeUuidLike(value, fallbackFactory = () => crypto.randomUUID()) {
  const normalized = normalizeString(value);
  return normalized || fallbackFactory();
}

export function signAccessToken(user) {
  const config = getJwtConfig();

  const userId = normalizeUserId(user?.id);
  const email = normalizeEmail(user?.email);

  return jwt.sign(
    {
      id: userId,
      email,
      type: "access",
    },
    config.jwtSecret,
    {
      algorithm: ALGORITHM,
      issuer: config.issuer,
      audience: config.audience,
      expiresIn: `${config.accessTtlMin}m`,
    }
  );
}

export function signRefreshToken(payload) {
  const config = getJwtConfig();

  const userId = normalizeUserId(payload?.userId);
  const familyId = normalizeUuidLike(payload?.familyId);
  const jti = normalizeUuidLike(payload?.jti);

  return jwt.sign(
    {
      id: userId,
      userId,
      familyId,
      jti,
      type: "refresh",
      typ: "refresh",
    },
    config.jwtRefreshSecret,
    {
      algorithm: ALGORITHM,
      issuer: config.issuer,
      audience: config.audience,
      expiresIn: `${config.refreshTtlDays}d`,
    }
  );
}

export function verifyRefreshToken(refreshToken) {
  const config = getJwtConfig();
  const token = normalizeString(refreshToken);

  if (!token) {
    throw new AppError("Refresh token inválido", 401);
  }

  try {
    const decoded = jwt.verify(token, config.jwtRefreshSecret, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: [ALGORITHM],
    });

    if (decoded?.type !== "refresh" && decoded?.typ !== "refresh") {
      throw new Error("Token inválido");
    }

    return decoded;
  } catch {
    throw new AppError("Refresh token inválido", 401);
  }
}

export function newJti() {
  return crypto.randomUUID();
}

export const generateAccessToken = signAccessToken;
export const generateRefreshToken = signRefreshToken;
